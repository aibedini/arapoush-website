import { DEFAULT_SETTINGS, type FormDefinition, type FormField, type L } from "./forms.ts";

/**
 * Built-in forms (P8, P11, contact page). OPEX seeds them as published forms; operators can relabel
 * them, add fields and change routing. The website renders the published version and falls back to
 * these definitions when OPEX is off, so the page always shows its forms.
 * Field ids are stable: components and routing rules refer to them.
 */
const name: FormField = { id: "name", type: "text", role: "name", required: true, width: "half", label: { fa: "نام و نام خانوادگی", en: "Full name", tr: "Ad soyad" }, max: 120 };
const company: FormField = { id: "company", type: "text", role: "company", width: "half", label: { fa: "شرکت", en: "Company", tr: "Şirket" }, max: 160 };
const email: FormField = { id: "email", type: "email", role: "email", required: true, width: "half", label: { fa: "ایمیل", en: "Email", tr: "E-posta" } };
const phone: FormField = { id: "phone", type: "phone", role: "phone", width: "half", label: { fa: "تلفن", en: "Phone", tr: "Telefon" }, max: 40 };
const message: FormField = { id: "message", type: "textarea", role: "message", label: { fa: "پیام", en: "Message", tr: "Mesaj" }, max: 4000 };
const attachment: FormField = {
  id: "attachment",
  type: "file",
  width: "full",
  label: { fa: "پیوست", en: "Attachment", tr: "Ek" },
  help: { fa: "تصویر یا PDF، حداکثر یک فایل", en: "An image or a PDF, one file", tr: "Bir görsel ya da PDF, tek dosya" },
  accept: ["pdf", "jpeg", "png", "webp"],
  max: 1,
};

const opt = (value: string, fa: string, en: string, tr: string) => ({ value, label: { fa, en, tr } satisfies L });

export const SYSTEM_FORMS: { slug: string; definition: FormDefinition }[] = [
  {
    slug: "quote",
    definition: {
      title: { fa: "درخواست قیمت", en: "Request a quote", tr: "Teklif isteyin" },
      intro: {},
      submitLabel: { fa: "ارسال درخواست", en: "Send request", tr: "Talebi gönder" },
      success: { fa: "درخواست شما رسید. همکاران فروش به‌زودی با شما تماس می‌گیرند.", en: "Your request has arrived. Our sales team will be in touch shortly.", tr: "Talebiniz ulaştı. Satış ekibimiz kısa süre içinde sizinle iletişime geçecek." },
      fields: [name, company, email, phone, { id: "quantity", type: "text", width: "half", label: { fa: "تیراژ", en: "Quantity", tr: "Miktar" }, max: 60 }, message],
      settings: { ...DEFAULT_SETTINGS, team: "sales", tags: ["quote"], subject: "" },
    },
  },
  {
    slug: "contact",
    definition: {
      title: { fa: "تماس با ما", en: "Contact us", tr: "Bize ulaşın" },
      intro: {},
      submitLabel: { fa: "ارسال پیام", en: "Send message", tr: "Mesajı gönder" },
      success: { fa: "پیام شما رسید. به‌زودی پاسخ می‌دهیم.", en: "Your message has arrived. We will reply soon.", tr: "Mesajınız ulaştı. Yakında yanıt vereceğiz." },
      fields: [name, company, email, phone, { ...message, required: true }],
      settings: { ...DEFAULT_SETTINGS, team: "sales", tags: ["contact"] },
    },
  },
  {
    // Contact page: one request form for every department (replaces the old sales call-back form).
    slug: "request",
    definition: {
      title: { fa: "ارسال درخواست", en: "Send a request", tr: "Talep gönderin" },
      intro: {},
      submitLabel: { fa: "ارسال درخواست", en: "Send request", tr: "Talebi gönder" },
      success: { fa: "درخواست شما رسید و به بخش مربوط فرستاده شد. به‌زودی با شما تماس می‌گیریم.", en: "Your request has arrived and went to the right department. We will be in touch shortly.", tr: "Talebiniz ulaştı ve ilgili birime iletildi. Kısa süre içinde sizinle iletişime geçeceğiz." },
      fields: [
        {
          id: "department",
          type: "select",
          required: true,
          width: "half",
          label: { fa: "بخش مرتبط", en: "Department", tr: "Birim" },
          options: [
            opt("sales", "فروش و سفارش", "Sales and orders", "Satış ve siparişler"),
            opt("design", "طراحی و گرافیک", "Design and artwork", "Tasarım ve grafik"),
            opt("lab", "آزمایشگاه", "Laboratory", "Laboratuvar"),
            opt("qc", "کنترل کیفیت", "Quality control", "Kalite kontrol"),
            opt("other", "سایر موارد", "Something else", "Diğer"),
          ],
        },
        { ...name },
        { ...company },
        { ...phone, required: true },
        { ...email, required: false },
        {
          id: "reply",
          type: "radio",
          required: true,
          width: "half",
          label: { fa: "روش پاسخ‌گویی", en: "How should we reply?", tr: "Nasıl yanıt verelim?" },
          options: [opt("phone", "تماس تلفنی", "By phone", "Telefonla"), opt("email", "ایمیل", "By email", "E-postayla")],
        },
        {
          id: "time",
          type: "select",
          width: "half",
          label: { fa: "زمان مناسب تماس", en: "Best time to call", tr: "Aranmak için uygun saat" },
          options: [opt("morning", "صبح (۸:۳۰ تا ۱۲)", "Morning (8:30–12)", "Sabah (8:30–12)"), opt("noon", "ظهر (۱۲ تا ۱۴)", "Midday (12–14)", "Öğle (12–14)"), opt("afternoon", "عصر (۱۴ تا ۱۷)", "Afternoon (14–17)", "Öğleden sonra (14–17)")],
          showIf: { field: "reply", op: "eq", value: "phone" },
        },
        { ...message, required: true, label: { fa: "پیام شما", en: "Your message", tr: "Mesajınız" } },
      ],
      settings: {
        ...DEFAULT_SETTINGS,
        team: "sales",
        tags: ["contact-page"],
        subject: "{department}: {name}",
        rules: ["sales", "design", "lab", "qc", "other"].map((d) => ({ when: { field: "department", op: "eq" as const, value: d }, set: { tags: [d] } })),
      },
    },
  },
  {
    // Tube page quote (T5): the selected configuration arrives in hidden fields and as ticket context.
    slug: "tube-quote",
    definition: {
      title: { fa: "استعلام قیمت تیوب", en: "Tube quote request", tr: "Tüp fiyat teklifi" },
      intro: {},
      submitLabel: { fa: "ارسال درخواست قیمت", en: "Request a quote", tr: "Teklif iste" },
      success: { fa: "درخواست شما ثبت شد.", en: "Your request is registered.", tr: "Talebiniz kaydedildi." },
      fields: [
        { ...name },
        { ...company },
        { ...phone, required: true, label: { fa: "شمارهٔ تماس", en: "Phone", tr: "Telefon" } },
        { ...email, required: false },
        {
          id: "contact",
          type: "radio",
          required: true,
          width: "full",
          label: { fa: "چطور با شما در ارتباط باشیم؟", en: "How should we contact you?", tr: "Size nasıl ulaşalım?" },
          options: [
            opt("phone", "تماس تلفنی", "Phone call", "Telefon"),
            opt("whatsapp", "واتساپ", "WhatsApp", "WhatsApp"),
            opt("telegram", "تلگرام", "Telegram", "Telegram"),
            opt("email", "ایمیل", "Email", "E-posta"),
            opt("visit", "مراجعهٔ حضوری کارشناس", "A visit from our specialist", "Uzman ziyareti"),
          ],
        },
        {
          id: "time",
          type: "select",
          width: "half",
          label: { fa: "زمان مناسب", en: "Best time", tr: "Uygun zaman" },
          options: [opt("morning", "صبح (۸:۳۰ تا ۱۲)", "Morning (8:30–12)", "Sabah (8:30–12)"), opt("noon", "ظهر (۱۲ تا ۱۴)", "Midday (12–14)", "Öğle (12–14)"), opt("afternoon", "عصر (۱۴ تا ۱۷)", "Afternoon (14–17)", "Öğleden sonra (14–17)")],
          showIf: { field: "contact", op: "in", value: ["phone", "whatsapp", "visit"] },
        },
        { id: "quantity", type: "number", width: "half", min: 1, label: { fa: "تیراژ (عدد)", en: "Quantity (pieces)", tr: "Adet" } },
        { id: "needed_by", type: "date", width: "half", label: { fa: "تاریخ مورد نیاز", en: "Needed by", tr: "İhtiyaç tarihi" } },
        {
          id: "artwork",
          type: "file",
          width: "full",
          label: { fa: "فایل طرح", en: "Artwork", tr: "Tasarım dosyası" },
          help: { fa: "PDF یا تصویر، تا ۳ فایل", en: "PDF or images, up to 3 files", tr: "PDF ya da görseller, en fazla 3 dosya" },
          accept: ["pdf", "jpeg", "png", "webp"],
          max: 3,
        },
        { ...message, label: { fa: "توضیحات", en: "Notes", tr: "Notlar" } },
        ...["shape", "diameter", "length", "closure", "cap_colour", "cap_hex", "body_colour", "print", "structure", "link"].map(
          (id): FormField => ({ id, type: "hidden", label: { fa: id, en: id, tr: id } }),
        ),
      ],
      settings: {
        ...DEFAULT_SETTINGS,
        team: "sales",
        tags: ["tube-quote"],
        subject: "Ø{diameter} × {length} {closure} — {name}",
        confirmation: {
          enabled: true,
          subject: { fa: "درخواست قیمت شما ثبت شد", en: "Your quote request is registered", tr: "Teklif talebiniz kaydedildi" },
          body: {
            fa: "{name} عزیز،\n\nدرخواست قیمت شما با شمارهٔ پیگیری #{number} ثبت شد. همکاران فروش آراپوش به‌زودی با روشی که انتخاب کردید با شما تماس می‌گیرند. برای پیگیری، همین شماره را اعلام کنید یا به این ایمیل پاسخ دهید.\n\nآراپوش گستر",
            en: "Dear {name},\n\nYour quote request is registered as #{number}. Arapoush sales will contact you shortly the way you chose. Quote this number when you follow it up, or simply reply to this email.\n\nArapoush Gostar",
            tr: "Sayın {name},\n\nTeklif talebiniz #{number} numarasıyla kaydedildi. Arapoush satış ekibi seçtiğiniz yolla kısa süre içinde sizinle iletişime geçecek. Takip için bu numarayı belirtin ya da bu e-postayı yanıtlayın.\n\nArapoush Gostar",
          },
        },
      },
    },
  },
  {
    // Applications page: a quote that knows the industry. Industry-specific questions appear only for
    // that industry; the solution finder fills industry, contents and priority.
    slug: "applications-quote",
    definition: {
      title: { fa: "درخواست راهکار بسته‌بندی", en: "Packaging solution request", tr: "Ambalaj çözümü talebi" },
      intro: {},
      submitLabel: { fa: "ارسال درخواست", en: "Send request", tr: "Talebi gönder" },
      success: { fa: "درخواست شما ثبت شد.", en: "Your request is registered.", tr: "Talebiniz kaydedildi." },
      fields: [
        {
          id: "industry",
          type: "select",
          required: true,
          width: "half",
          label: { fa: "صنعت", en: "Industry", tr: "Sektör" },
          options: [
            opt("cosmetics", "آرایشی", "Cosmetics", "Kozmetik"),
            opt("hygiene", "بهداشتی", "Hygiene", "Hijyen"),
            opt("pharma", "دارویی", "Pharmaceutical", "İlaç"),
            opt("food", "غذایی", "Food", "Gıda"),
            opt("industrial", "صنعتی", "Industrial", "Endüstriyel"),
            opt("other", "سایر", "Other", "Diğer"),
          ],
        },
        {
          id: "contents",
          type: "select",
          width: "half",
          label: { fa: "محتوای محصول", en: "What's inside", tr: "İçerik" },
          options: [
            opt("cream", "کرم / ماده غلیظ", "Cream / thick paste", "Krem / koyu macun"),
            opt("gel", "ژل", "Gel", "Jel"),
            opt("liquid", "مایع / رقیق", "Liquid / runny", "Sıvı / akışkan"),
            opt("tablet", "جامد / قرص", "Solid / tablets", "Katı / tablet"),
            opt("other", "سایر", "Other", "Diğer"),
          ],
        },
        { ...name },
        { ...company, required: true },
        { ...phone, required: true, label: { fa: "شمارهٔ تماس", en: "Phone", tr: "Telefon" } },
        { ...email, required: false },
        { id: "quantity", type: "number", width: "half", min: 1, label: { fa: "تیراژ موردنظر (عدد)", en: "Quantity (pieces)", tr: "Adet" } },
        { id: "size", type: "text", width: "half", max: 120, label: { fa: "حجم یا ابعاد تقریبی", en: "Approximate volume or size", tr: "Yaklaşık hacim ya da ölçü" } },
        {
          id: "storage",
          type: "select",
          width: "half",
          label: { fa: "شرایط نگهداری", en: "Storage", tr: "Saklama" },
          options: [opt("room", "دمای اتاق", "Room temperature", "Oda sıcaklığı"), opt("cold", "یخچال", "Refrigerated", "Buzdolabı"), opt("dry", "دور از رطوبت", "Kept dry", "Kuru ortam")],
          showIf: { field: "industry", op: "in", value: ["pharma", "food"] },
        },
        {
          id: "sensitive",
          type: "checkbox",
          width: "half",
          label: { fa: "محصول به رطوبت یا نور حساس است", en: "The product is sensitive to moisture or light", tr: "Ürün neme ya da ışığa duyarlı" },
          showIf: { field: "industry", op: "in", value: ["pharma", "food", "cosmetics"] },
        },
        {
          id: "hazard",
          type: "checkbox",
          width: "full",
          label: { fa: "محتوا خورنده، چسبنده یا حساسیت‌زاست (برگهٔ اطلاعات ایمنی را پیوست کنید)", en: "The contents are corrosive, sticky or irritant (attach the safety data sheet)", tr: "İçerik aşındırıcı, yapışkan ya da tahriş edici (güvenlik bilgi formunu ekleyin)" },
          showIf: { field: "industry", op: "eq", value: "industrial" },
        },
        { id: "requirements", type: "textarea", width: "full", max: 2000, label: { fa: "الزامات خاص (درب، چاپ، ساختار…)", en: "Special requirements (cap, print, structure…)", tr: "Özel gereksinimler (kapak, baskı, yapı…)" } },
        {
          id: "files",
          type: "file",
          width: "full",
          label: { fa: "فایل طرح یا مشخصات فنی", en: "Artwork or technical specs", tr: "Tasarım ya da teknik bilgiler" },
          help: { fa: "PDF یا تصویر، تا ۳ فایل", en: "PDF or images, up to 3 files", tr: "PDF ya da görseller, en fazla 3 dosya" },
          accept: ["pdf", "jpeg", "png", "webp"],
          max: 3,
        },
        ...["priority", "source"].map((id): FormField => ({ id, type: "hidden", label: { fa: id, en: id, tr: id } })),
      ],
      settings: {
        ...DEFAULT_SETTINGS,
        team: "sales",
        tags: ["applications-quote"],
        subject: "{industry}: {company} — {name}",
        confirmation: {
          enabled: true,
          subject: { fa: "درخواست شما ثبت شد", en: "Your request is registered", tr: "Talebiniz kaydedildi" },
          body: {
            fa: "{name} عزیز،\n\nدرخواست راهکار بسته‌بندی شما با شمارهٔ پیگیری #{number} ثبت شد. کارشناسان آراپوش به‌زودی با شما تماس می‌گیرند. برای پیگیری، همین شماره را اعلام کنید یا به این ایمیل پاسخ دهید.\n\nآراپوش گستر",
            en: "Dear {name},\n\nYour packaging request is registered as #{number}. Arapoush specialists will contact you shortly. Quote this number when you follow it up, or simply reply to this email.\n\nArapoush Gostar",
            tr: "Sayın {name},\n\nAmbalaj talebiniz #{number} numarasıyla kaydedildi. Arapoush uzmanları kısa süre içinde sizinle iletişime geçecek. Takip için bu numarayı belirtin ya da bu e-postayı yanıtlayın.\n\nArapoush Gostar",
          },
        },
      },
    },
  },
  {
    slug: "careers",
    definition: {
      title: { fa: "ارسال رزومه", en: "Apply", tr: "Başvuru" },
      intro: {},
      submitLabel: { fa: "ارسال رزومه", en: "Send application", tr: "Başvuruyu gönder" },
      success: { fa: "رزومهٔ شما رسید. اگر با موقعیت هم‌خوانی داشته باشد، همکاران منابع انسانی با شما تماس می‌گیرند.", en: "Your application has arrived. If it matches the role, our HR team will contact you.", tr: "Başvurunuz ulaştı. Pozisyona uygunsa insan kaynakları ekibimiz sizinle iletişime geçecek." },
      fields: [
        { ...name },
        {
          id: "position",
          type: "select",
          required: true,
          width: "half",
          label: { fa: "موقعیت شغلی", en: "Position", tr: "Pozisyon" },
          options: [opt("sales", "کارشناس فروش", "Sales specialist", "Satış uzmanı"), opt("open", "درخواست همکاری عمومی", "Open application", "Genel başvuru")],
        },
        { ...phone, required: true, label: { fa: "شمارهٔ موبایل", en: "Mobile number", tr: "Cep telefonu" } },
        { ...email },
        {
          id: "experience",
          type: "select",
          width: "half",
          label: { fa: "سابقهٔ کار", en: "Experience", tr: "Deneyim" },
          options: [opt("0-2", "تا ۲ سال", "Up to 2 years", "2 yıla kadar"), opt("3-5", "۳ تا ۵ سال", "3 to 5 years", "3–5 yıl"), opt("6+", "بیش از ۵ سال", "More than 5 years", "5 yıldan fazla")],
        },
        {
          id: "resume",
          type: "file",
          required: true,
          width: "full",
          label: { fa: "فایل رزومه", en: "Résumé", tr: "Özgeçmiş" },
          help: { fa: "PDF، یک فایل", en: "PDF, one file", tr: "PDF, tek dosya" },
          accept: ["pdf"],
          max: 1,
        },
        { ...message, label: { fa: "توضیحات تکمیلی", en: "Anything else", tr: "Eklemek istedikleriniz" } },
      ],
      settings: { ...DEFAULT_SETTINGS, team: null, tags: ["careers"], subject: "{position}: {name}" },
    },
  },
  {
    slug: "feedback",
    definition: {
      title: { fa: "نظرات و پیشنهادات", en: "Ideas and suggestions", tr: "Görüş ve öneriler" },
      intro: { fa: "نام و راه تماس اختیاری است؛ اگر پاسخ می‌خواهید، آن‌ها را بنویسید.", en: "Your name and contact details are optional; add them if you would like a reply.", tr: "Ad ve iletişim bilgileri isteğe bağlıdır; yanıt isterseniz ekleyin." },
      submitLabel: { fa: "ارسال پیشنهاد", en: "Send suggestion", tr: "Öneriyi gönder" },
      success: { fa: "سپاس از وقتی که گذاشتید. پیشنهاد شما به مدیریت رسید.", en: "Thank you for your time. Your suggestion has reached our management.", tr: "Zaman ayırdığınız için teşekkürler. Öneriniz yönetimimize ulaştı." },
      fields: [
        { ...name, required: false },
        { ...phone },
        { ...email, required: false },
        { ...message, required: true, label: { fa: "نظر یا پیشنهاد", en: "Your idea or suggestion", tr: "Görüşünüz ya da öneriniz" } },
        attachment,
      ],
      settings: { ...DEFAULT_SETTINGS, team: null, tags: ["feedback"] },
    },
  },
  {
    slug: "complaint",
    definition: {
      title: { fa: "انتقادات و شکایات", en: "Complaints", tr: "Şikâyetler" },
      intro: { fa: "موضوع در اولین فرصت بررسی می‌شود و نتیجه را به شما اطلاع می‌دهیم.", en: "We look into every complaint at the first opportunity and let you know the outcome.", tr: "Her şikâyeti ilk fırsatta inceler ve sonucu size bildiririz." },
      submitLabel: { fa: "ثبت شکایت", en: "Submit complaint", tr: "Şikâyeti gönder" },
      success: { fa: "شکایت شما ثبت شد. با شمارهٔ پیگیری می‌توانید وضعیت آن را از ما بپرسید.", en: "Your complaint is registered. Quote the reference number when you follow it up.", tr: "Şikâyetiniz kaydedildi. Takip ederken referans numarasını belirtin." },
      fields: [
        { ...name },
        { id: "subject", type: "text", required: true, width: "half", label: { fa: "موضوع", en: "Subject", tr: "Konu" }, max: 160 },
        { ...phone },
        { ...email, required: false },
        { ...message, required: true, label: { fa: "شرح موضوع", en: "What happened", tr: "Ne oldu" } },
        attachment,
      ],
      settings: { ...DEFAULT_SETTINGS, team: null, priority: "high", tags: ["complaint"], subject: "{subject}" },
    },
  },
];

/** The public shape the Delivery API serves for a form (no routing, rules or notify addresses). */
export const publicFormOf = (slug: string, version: number, d: FormDefinition) => ({
  slug,
  version,
  title: d.title,
  intro: d.intro,
  submitLabel: d.submitLabel,
  success: d.success,
  fields: d.fields,
  page: d.settings.page,
});

/** A built-in form in its public shape, for the site to render when OPEX does not serve it. */
export function systemPublicForm(slug: string) {
  const f = SYSTEM_FORMS.find((s) => s.slug === slug);
  return f ? publicFormOf(f.slug, 0, f.definition) : undefined;
}
