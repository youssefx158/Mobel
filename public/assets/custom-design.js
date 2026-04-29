import { api, qs } from "./app.js";

const imageInputs = [qs("#designImage1"), qs("#designImage2")];
const previewEls = [qs("#preview1"), qs("#preview2")];
const uploadStatus = qs("#uploadStatus");
const submitDesignBtn = qs("#submitDesignBtn");
const customerPhone = qs("#customerPhone");
const customerDetails = qs("#customerDetails");
const submitError = qs("#submitError");
const submitSuccess = qs("#submitSuccess");
const phoneField = qs("#phoneField");
const detailsField = qs("#detailsField");

const state = {
  uploads: [null, null],
};

bindUpload(0);
bindUpload(1);
submitDesignBtn.addEventListener("click", handleSubmit);
syncUploadHint();

function bindUpload(index) {
  imageInputs[index].addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    clearSubmitMessages();
    try {
      const dataUrl = await optimizeImage(file);
      state.uploads[index] = dataUrl;
      previewEls[index].innerHTML = `<img src="${escapeAttr(dataUrl)}" alt="" />`;
      syncUploadHint();
    } catch (error) {
      submitError.textContent = error.message || "تعذر تجهيز الصورة";
      submitError.style.display = "block";
      event.target.value = "";
      state.uploads[index] = null;
      previewEls[index].innerHTML = `<span>اضغط لاختيار الصورة</span>`;
      syncUploadHint();
    }
  });
}

function syncUploadHint() {
  const count = state.uploads.filter(Boolean).length;
  if (count < 2) {
    uploadStatus.textContent = `تم تجهيز ${count} من 2 صورة`;
    return;
  }
  uploadStatus.textContent = "تم تجهيز الصورتين. يمكنك الآن إرسال الطلب.";
}

function clearSubmitMessages() {
  submitError.style.display = "none";
  submitError.textContent = "";
  submitSuccess.style.display = "none";
  submitSuccess.textContent = "";
}

async function handleSubmit() {
  const phone = String(customerPhone.value || "").trim();
  const details = String(customerDetails.value || "").trim();

  clearSubmitMessages();
  markField(phoneField, /^01[0125]\d{8}$/.test(phone.replace(/\D/g, "")));
  markField(detailsField, details.length >= 6);

  if (state.uploads.some((item) => !item)) {
    submitError.textContent = "ارفع الصورتين أولاً";
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
        images: state.uploads,
      }),
    });

    submitSuccess.textContent = `تم إرسال الطلب بنجاح. رقم الطلب: ${data.designId}`;
    submitSuccess.style.display = "block";
    customerPhone.value = "";
    customerDetails.value = "";
    phoneField.classList.remove("bad");
    detailsField.classList.remove("bad");
  } catch (error) {
    submitError.textContent = error.message || "تعذر إرسال الطلب";
    submitError.style.display = "block";
  } finally {
    submitDesignBtn.disabled = false;
    submitDesignBtn.textContent = "إرسال الطلب";
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
