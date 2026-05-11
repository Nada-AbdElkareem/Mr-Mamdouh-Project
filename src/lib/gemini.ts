import { GoogleGenAI, Type } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY || "AIzaSyBhnzIhPAlXk4rPXSJiC7ZfjM6_rgHeX-0";
if (!apiKey) {
  console.error("GEMINI_API_KEY is missing from environment variables.");
}
const ai = new GoogleGenAI({ apiKey });

export interface ServiceItem {
  id: string;
  specialty: string;
  condition: string;
  doctorName: string;
  serviceType: string;
}

export interface ExtractedData {
  documentType: 'national_id' | 'birth_certificate' | 'passport' | 'unhcr_card' | 'driving_license' | 'work_permit' | 'other';
  otherDescription?: string;
  notes?: string;
  name?: string;
  nationalId?: string;
  licenseNumber?: string;
  permitNumber?: string;
  birthDate?: string;
  address?: string;
  job?: string;
  religion?: string;
  status?: string;
  // Birth certificate specific
  fatherName?: string;
  motherName?: string;
  birthPlace?: string;
  nationality?: string;
  // Passport/UNHCR specific
  passportNumber?: string;
  unhcrIndividualNumber?: string;
  unhcrFileNumber?: string;
  expiryDate?: string;
  issuingCountry?: string;
  // Professional services
  serviceItems?: ServiceItem[];
  suggestedServices?: string[];
  customFields?: Record<string, string>;
  thumbnail?: string;
  rawText: string;
}

export async function extractDocumentData(
  base64Image: string, 
  mimeType: string, 
  historyContext: string = "",
  priorityDocTypes: string[] = []
): Promise<ExtractedData> {
  if (!apiKey) {
    throw new Error("خطأ: مفتاح API (GEMINI_API_KEY) غير موجود. يرجى التأكد من إضافة المفتاح في ملف .env في المجلد الرئيسي للمشروع.");
  }
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: [
      {
        parts: [
          {
            inlineData: {
              data: base64Image.split(',')[1],
              mimeType: mimeType
            }
          },
          {
            text: `Extract information from this official document. 
            Analyze the image and categorize it accordingly.
            
            ${priorityDocTypes.length > 0 ? `PRIORITY DOCUMENT TYPES (The user has marked these as most likely types for this session):\n- ${priorityDocTypes.join('\n- ')}\n` : ""}

            Analyze the image and if it's a National ID card, Birth Certificate, Passport, or UNHCR Refugee Card (كارت المفوضية), extract the details precisely.

            ${historyContext ? `ACCUMULATIVE LEARNING CONTEXT (Patterns from recent successful extractions to improve your accuracy):\n${historyContext}` : ""}
            
            For Egyptian Birth Certificates (شهادة ميلاد مميكنة):
            - Full name of the child (الاسم بالكامل): Extract the complete 4-5 part name precisely. Look for the label "اسم المولود".
            - 14-digit National ID (الرقم القومي): The unique ID for the child at the top.
            - Date of Birth (تاريخ الميلاد): Use the numeric field "تاريخ الميلاد" and cross-reference with "تاريخ الميلاد كتابة" (Birth date in words) for absolute accuracy.
            - Place of Birth (محل الميلاد): Extract both Governorate (المحافظة) and City/District (المركز/القسم) precisely.
            - Father's full name (اسم الأب) and Mother's full name (اسم الأم).
            - Nationality (الجنسية) and Religion (الديانة).

            For National ID Cards (بطاقة الرقم القومي):
            - Extract the 14-digit National ID with extreme care. If any character is unclear, refer to the structure: [Century][YYMMDD][GovCode][Serial][Gender][Checksum].
            - Capture Full Name (4-5 parts), Address, Job, Religion, and Status.

            For Driving Licenses (رخصة قيادة):
            - License Number (رقم الرخصة): Usually 14 digits or a specific code.
            - Name, Expiry Date, and categories of vehicles allowed.
            - Identify the issuing authority/Governorate.

            For Work Permits (تصريح عمل):
            - Permit Number (رقم التصريح).
            - Name, Employer, Job, and Nationality.
            - Issue and Expiry Dates.

            For UNHCR Refugee Cards (كارت المفوضية):
            - Full Name: Extract the exact name written.
            - Individual Number (رقم الفرد): CRITICAL ID. Look for the number usually found in parentheses next to the person's name or specifically labeled as "رقم الفرد".
            - File Number / Code (رقم الملف / كود الملف): CRITICAL ID. This is also the Family Number. Look for "رقم الملف" or locate the alphanumeric code (e.g., 000-00C00000) usually printed at the top right of the document.
            - Nationality (الجنسية): CRITICAL. Identify the actual nationality (e.g., Sudanese, Syrian).
            - NOTE: UNHCR cards DO NOT have an Egyptian 14-digit National ID. Set "nationalId" to an empty string "".

            For Passports and other Non-Egyptian IDs: 
            - CRITICAL: Detect "Issuing Country" (بلد الإصدار) and "Nationality" (الجنسية).
            - NOTE: Passports DO NOT have an Egyptian 14-digit National ID. Set "nationalId" to an empty string "".

            Return the data in the following JSON format:
            {
              "documentType": "national_id" | "birth_certificate" | "passport" | "unhcr_card" | "driving_license" | "work_permit" | "other",
              "otherDescription": "Description of the document if type is other",
              "notes": "Any manual notes or observations about the document",
              "name": "Full Name",
              "nationalId": "14-digit number (ONLY for Egyptian ID/Birth Cert, otherwise empty string)",
              "licenseNumber": "License Number (if applicable)",
              "permitNumber": "Permit Number (if applicable)",
              "unhcrIndividualNumber": "Individual ID (for UNHCR)",
              "unhcrFileNumber": "File Number / Code (for UNHCR)",
              "birthDate": "YYYY-MM-DD",
              "address": "Full Address",
              "job": "Profession",
              "religion": "Religion",
              "status": "Marital/Military status",
              "fatherName": "Father's Full Name",
              "motherName": "Mother's Full Name",
              "birthPlace": "Place of Birth",
              "nationality": "Nationality name (e.g. Sudanese, Syrian)",
              "passportNumber": "Passport Number",
              "expiryDate": "Expiry Date",
              "issuingCountry": "Full Country Name that issued the document",
              "suggestedServices": ["Service 1", "Service 2"],
              "rawText": "Complete transcription"
            }
            
            Be extremely precise with ID numbers and ensure names/nationalities are captured fully as written. If the document is NOT Egyptian, clearly identify the nationality from the text.
            If you are not confident in the document type, set "documentType" to "other" and provide a brief description in "otherDescription".
            Output ONLY valid JSON.`
          }
        ]
      }
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          documentType: { type: Type.STRING },
          otherDescription: { type: Type.STRING },
          notes: { type: Type.STRING },
          name: { type: Type.STRING },
          nationalId: { type: Type.STRING },
          licenseNumber: { type: Type.STRING },
          permitNumber: { type: Type.STRING },
          unhcrIndividualNumber: { type: Type.STRING },
          unhcrFileNumber: { type: Type.STRING },
          birthDate: { type: Type.STRING },
          address: { type: Type.STRING },
          job: { type: Type.STRING },
          religion: { type: Type.STRING },
          status: { type: Type.STRING },
          fatherName: { type: Type.STRING },
          motherName: { type: Type.STRING },
          birthPlace: { type: Type.STRING },
          nationality: { type: Type.STRING },
          passportNumber: { type: Type.STRING },
          expiryDate: { type: Type.STRING },
          issuingCountry: { type: Type.STRING },
          suggestedServices: { type: Type.ARRAY, items: { type: Type.STRING } },
          rawText: { type: Type.STRING }
        },
        required: ["documentType", "rawText"]
      }
    }
  });

  const text = response.text || "{}";
  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("Failed to parse AI response", text);
    throw new Error("فشل في تحليل بيانات الوثيقة");
  }
}
