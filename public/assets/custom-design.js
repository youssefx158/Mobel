import { api, qs } from "./app.js";

const imageInputs = [qs("#designImage1"), qs("#designImage2")];
const previewEls = [qs("#preview1"), qs("#preview2")];
const generateBtn = qs("#generateDesignBtn");
const generateStatus = qs("#generateStatus");
const generateError = qs("#generateError");
const resultSection = qs("#resultSection");
const generatedDesignImage = qs("#generatedDesignImage");
const generatedDesignText = qs("#generatedDesignText");
const submitDesignBtn = qs("#submitDesignBtn");
const customerPhone = qs("#customerPhone");
const customerDetails = qs("#customerDetails");
const submitError = qs("#submitError");
const submitSuccess = qs("#submitSuccess");
const phoneField = qs("#phoneField");
const detailsField = qs("#detailsField");

const state = {
  uploads: [null, null],
  referenceImages: [],
  generatedImage: "",
  generatedText: "",
};

bindUpload(0);
bindUpload(1);
generateBtn.addEventListener("click", handleGenerate);
submitDesignBtn.addEventListener("click", handleSubmit);

function bindUpload(index) {
  imageInputs[index].addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    clearGenerateError();
    try {
      const dataUrl = await optimizeImage(file);
      state.uploads[index] = dataUrl;
      previewEls[index].innerHTML = `<img src="${escapeAttr(dataUrl)}" alt="" />`;
      resetGeneratedResult();
      syncGenerateHint();
    } catch (error) {
      generateError.textContent = error.message || "تعذر تجهيز الصورة";
      generateError.style.display = "block";
      event.target.value = "";
      state.uploads[index] = null;
      previewEls[index].innerHTML = `<span>اضغط لاختيار الصورة</span>`;
      syncGenerateHint();
    }
  });
}

function syncGenerateHint() {
  const count = state.uploads.filter(Boolean).length;
  if (count < 2) {
    generateStatus.textContent = `تم تجهيز ${count} من 2 صورة`;
    return;
  }
  generateStatus.textContent = "كل شيء جاهز، اضغط إنشاء التصميم.";
}

function clearGenerateError() {
  generateError.style.display = "none";
  generateError.textContent = "";
}

function resetGeneratedResult() {
  state.referenceImages = [];
  state.generatedImage = "";
  state.generatedText = "";
  generatedDesignImage.removeAttribute("src");
  generatedDesignText.textContent = "";
  resultSection.style.display = "none";
  submitSuccess.style.display = "none";
  submitSuccess.textContent = "";
  submitError.style.display = "none";
  submitError.textContent = "";
}

async function handleGenerate() {
  clearGenerateError();
  if (state.uploads.some((item) => !item)) {
    generateError.textContent = "ارفع الصورتين أولاً";
    generateError.style.display = "block";
    return;
  }

  generateBtn.disabled = true;
  generateBtn.textContent = "جاري إنشاء التصميم...";
  generateStatus.textContent = "يتم الآن إرسال الصور إلى Gemini وتجهيز النتيجة.";

  try {
    const data = await api("/api/custom-designs/generate", {
      method: "POST",
      body: JSON.stringify({ images: state.uploads }),
    });

    state.generatedImage = data.generatedImage || "";
    state.generatedText = data.generatedText || "تم إنشاء التصميم بنجاح.";
    state.referenceImages = Array.isArray(data.referenceImages) ? data.referenceImages : [];

    generatedDesignImage.src = state.generatedImage;
    generatedDesignText.textContent = state.generatedText;
    resultSection.style.display = "grid";
    resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
    generateStatus.textContent = "تم إنشاء التصميم، أكمل بيانات التواصل بالأسفل.";
  } catch (error) {
    generateError.textContent = error.message || "فشل إنشاء التصميم";
    generateError.style.display = "block";
    generateStatus.textContent = "حاول بصورة أوضح أو أعد المحاولة بعد قليل.";
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = "إنشاء التصميم";
  }
}

async function handleSubmit() {
  const phone = String(customerPhone.value || "").trim();
  const details = String(customerDetails.value || "").trim();

  markField(phoneField, /^01[0125]\d{8}$/.test(phone.replace(/\D/g, "")));
  markField(detailsField, details.length >= 6);
  submitError.style.display = "none";
  submitSuccess.style.display = "none";

  if (!state.generatedImage) {
    submitError.textContent = "قم بإنشاء التصميم أولاً";
    submitError.style.display = "block";
    return;
  }

  if (phoneField.classList.contains("bad") || detailsField.classList.contains("bad")) {
    return;
  }

  submitDesignBtn.disabled = true;
  submitDesignBtn.textContent = "جاري الإرسال...";

  try {
    const data = await api("/api/custom-designs", {
      method: "POST",
      body: JSON.stringify({
        phone,
        contactDetails: details,
        generatedImage: state.generatedImage,
        generatedText: state.generatedText,
        referenceImages: state.referenceImages,
      }),
    });

    submitSuccess.textContent = `تم إرسال التصميم بنجاح. رقم الطلب: ${data.designId}`;
    submitSuccess.style.display = "block";
    customerPhone.value = "";
    customerDetails.value = "";
    phoneField.classList.remove("bad");
    detailsField.classList.remove("bad");
  } catch (error) {
    submitError.textContent = error.message || "تعذر إرسال التصميم";
    submitError.style.display = "block";
  } finally {
    submitDesignBtn.disabled = false;
    submitDesignBtn.textContent = "إرسال التصميم";
  }
}

function markField(field, isValid) {
  field.classList.toggle("bad", !isValid);
}

async function optimizeImage(file) {
  if (!file.type.startsWith("image/")) {
    throw new Error("نوع الملف يجب أن يكون صورة");
  }

  const rawDataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(rawDataUrl);
  const maxSide = 1400;
  const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("تعذر تجهيز الصورة");
  }

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.9);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("تعذر قراءة الصورة"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("تعذر تحميل الصورة"));
    img.src = src;
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

syncGenerateHint();
