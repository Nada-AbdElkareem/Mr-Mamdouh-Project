/**
 * Validates Egyptian National ID (14 digits)
 * Structure: [Century][YYMMDD][Governorate][Sequential][Checksum]
 */
export function validateNationalID(id: string) {
  if (!id) return { isValid: false, error: "رقم الهوية مطلوب" };
  if (!/^\d+$/.test(id)) return { isValid: false, error: "يجب أن يحتوي الرقم القومي على أرقام فقط" };
  if (id.length !== 14) return { isValid: false, error: `الرقم القومي يجب أن يكون 14 رقمًا (الحالي: ${id.length} رقم)` };

  const centuryChar = id[0];
  const year = id.substring(1, 3);
  const month = id.substring(3, 5);
  const day = id.substring(5, 7);
  const govCode = id.substring(7, 9);
  const genderDigit = id[12];

  // Century: 2 = 1900-1999, 3 = 2000-2099, 4 = 2100-2199
  const century = centuryChar === '2' ? '19' : centuryChar === '3' ? '20' : centuryChar === '4' ? '21' : null;
  if (!century) return { isValid: false, error: "رقم القرن (أول رقم) غير صحيح. يجب أن يكون 2 للمواليد قبل 2000 أو 3 للمواليد بعد 2000" };

  const m = parseInt(month);
  if (m < 1 || m > 12) return { isValid: false, error: `رقم الشهر غير صحيح (${month})` };

  const d = parseInt(day);
  if (d < 1 || d > 31) return { isValid: false, error: `رقم اليوم غير صحيح (${day})` };

  const birthDate = new Date(`${century}${year}-${month}-${day}`);
  if (isNaN(birthDate.getTime())) return { isValid: false, error: "تاريخ الميلاد المحفوظ في الرقم القومي غير صالح من الناحية التقويمية" };

  const governorates: Record<string, string> = {
    '01': 'القاهرة', '02': 'الإسكندرية', '03': 'بورسعيد', '04': 'السويس',
    '11': 'دمياط', '12': 'الدقهلية', '13': 'الشرقية', '14': 'القليوبية',
    '15': 'كفر الشيخ', '16': 'الغربية', '17': 'المنوفية', '18': 'البحيرة',
    '19': 'الإسماعيلية', '21': 'الجيزة', '22': 'بني سويف', '23': 'الفيوم',
    '24': 'المنيا', '25': 'أسيوط', '26': 'سوهاج', '27': 'قنا',
    '28': 'أسوان', '29': 'الأقصر', '31': 'البحر الأحمر', '32': 'الوادي الجديد',
    '33': 'مطروح', '34': 'شمال سيناء', '35': 'جنوب سيناء', '88': 'خارج الجمهورية'
  };

  const governorate = governorates[govCode];
  if (!governorate) return { isValid: false, error: `كود المحافظة غير صحيح (${govCode}). تأكد من الرقمين 8 و 9` };

  const gender = parseInt(genderDigit) % 2 === 0 ? 'أنثى' : 'ذكر';

  return {
    isValid: true,
    data: {
      birthDate: `${century}${year}/${month}/${day}`,
      governorate,
      gender
    }
  };
}

/**
 * Basic validation for UNHCR numbers
 */
export function validateUNHCRNumber(num: string, type: 'individual' | 'file' = 'individual') {
  if (!num) return { isValid: false, error: "الرقم مطلوب" };
  
  if (type === 'individual') {
    if (!/^[0-9\-]+$/.test(num)) return { isValid: false, error: "رقم الفرد يجب أن يحتوي على أرقام أو '-' فقط" };
    if (num.replace(/-/g, '').length < 8) return { isValid: false, error: "رقم الفرد قصير جداً" };
  } else {
    // File numbers like 000-14C00000
    if (num.length < 10) return { isValid: false, error: "كود الملف قصير جداً" };
    if (!num.includes('-')) return { isValid: false, error: "كود الملف يجب أن يحتوي على شرطة (-) مثل 000-24C01234" };
  }
  
  if (!/^[a-zA-Z0-9\-\/]+$/.test(num)) return { isValid: false, error: "يحتوي الرقم على رموز غير مسموح بها" };
  
  return { isValid: true };
}

/**
 * Applies filters (brightness, contrast, saturation, sharpness) to a base64 image
 */
export function applyFiltersToImage(base64: string, filters: { brightness: number, contrast: number, saturation: number, sharpness: number }): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = base64;
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(base64);

        // Apply brightness, contrast, and saturation using native filter
        ctx.filter = `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturation}%)`;
        ctx.drawImage(img, 0, 0);

        // Advanced Enhancement for OCR
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const len = data.length;

        // 1. Improved Contrast Stretching (Manual Histogram Equalization hint)
        // Find true min and max per channel for better normalization
        let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
        for (let i = 0; i < len; i += 4) {
          if (data[i] < rMin) rMin = data[i];
          if (data[i] > rMax) rMax = data[i];
          if (data[i+1] < gMin) gMin = data[i+1];
          if (data[i+1] > gMax) gMax = data[i+1];
          if (data[i+2] < bMin) bMin = data[i+2];
          if (data[i+2] > bMax) bMax = data[i+2];
        }

        // Apply stretching with small clipping to remove noise peaks
        for (let i = 0; i < len; i += 4) {
          data[i] = ((data[i] - rMin) / (rMax - rMin || 1)) * 255;
          data[i+1] = ((data[i+1] - gMin) / (gMax - gMin || 1)) * 255;
          data[i+2] = ((data[i+2] - bMin) / (bMax - bMin || 1)) * 255;
        }

        // 2. Grayscale conversion for OCR stability
        // OCR works best on high-contrast grayscale
        const isBinarizeNeeded = filters.contrast > 150; // Threshold for intentional binarization
        
        if (isBinarizeNeeded) {
          for (let i = 0; i < len; i += 4) {
             const gray = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
             // Simple adaptive step: if gray is above middle of contrast-stretched range, it's back, else black
             const threshold = 128;
             const val = gray > threshold ? 255 : 0;
             data[i] = data[i+1] = data[i+2] = val;
          }
        }

        // 3. Apply sharpness if requested (Stronger Laplacian-style convolution)
        if (filters.sharpness > 0) {
          const width = imageData.width;
          const height = imageData.height;
          const factor = filters.sharpness / 100;
          
          const tempData = new Uint8ClampedArray(data);
          
          for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
              const idx = (y * width + x) * 4;
              for (let c = 0; c < 3; c++) {
                const center = tempData[idx + c];
                const surrounding = (
                  tempData[((y - 1) * width + x) * 4 + c] +
                  tempData[((y + 1) * width + x) * 4 + c] +
                  tempData[(y * width + (x - 1)) * 4 + c] +
                  tempData[(y * width + (x + 1)) * 4 + c]
                );
                let val = center + factor * (4 * center - surrounding);
                data[idx + c] = Math.min(255, Math.max(0, val));
              }
            }
          }
        }

        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.95));
      } catch (e) {
        console.error('Filter application failed:', e);
        resolve(base64);
      }
    };
    img.onerror = () => resolve(base64);
  });
}

/**
 * Checks for similarity between two strings using an improved fuzzy logic
 */
export function isSimilar(str1: string, str2: string, threshold = 0.7): boolean {
  if (!str1 || !str2) return false;
  
  // Normalize strings: lowercase, trim, remove multiple spaces, remove non-arabic/latin alphanumeric
  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  
  const s1 = normalize(str1);
  const s2 = normalize(str2);
  
  if (s1 === s2) return true;
  if (s1.includes(s2) || s2.includes(s1)) return true;

  // For IDs/Numbers, check exact match but strip non-digits first
  const clean1 = s1.replace(/\D/g, '');
  const clean2 = s2.replace(/\D/g, '');
  if (clean1.length > 5 && clean2.length > 5) {
    if (clean1 === clean2) return true;
  }

  // Address-specific logic: check for significant overlaps
  if (s1.length > 15 && s2.length > 15) {
    if (s1.includes(s2.substring(0, 15)) || s2.includes(s1.substring(0, 15))) {
       // High overlap in start of address often indicates same area/place
       threshold = 0.6; // lower threshold for long address matches
    }
  }

  // Jaccard similarity for words
  const words1 = s1.split(' ').filter(w => w.length > 1);
  const words2 = s2.split(' ').filter(w => w.length > 1);
  
  if (words1.length === 0 || words2.length === 0) return false;

  const set1 = new Set(words1);
  const set2 = new Set(words2);
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  const jaccard = intersection.size / union.size;
  if (jaccard >= threshold) return true;

  // Fallback: If 3 or more words match in a name (typical in Arabic names)
  if (intersection.size >= 3) return true;

  return false;
}

/**
 * Rotates a base64 image by degrees (90, 180, 270)
 */
export function rotateImage(base64: string, degrees: number): Promise<string> {
  return new Promise((resolve) => {
    if (degrees === 0) return resolve(base64);
    
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = base64;
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const radians = (degrees * Math.PI) / 180;
        
        // Adjust canvas size for 90 or 270 degrees
        if (degrees % 180 !== 0) {
          canvas.width = img.height;
          canvas.height = img.width;
        } else {
          canvas.width = img.width;
          canvas.height = img.height;
        }
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(base64);
        
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(radians);
        ctx.drawImage(img, -img.width / 2, -img.height / 2);
        
        resolve(canvas.toDataURL('image/jpeg', 0.95));
      } catch (e) {
        console.error('Rotation failed:', e);
        resolve(base64);
      }
    };
    img.onerror = () => resolve(base64);
  });
}

/**
 * Calculates age based on birth date and a reference date (entry date)
 */
export function calculateAge(birthDateStr: string, referenceDateStr?: string) {
  if (!birthDateStr) return null;
  
  try {
    // Standardize format: YYYY-MM-DD or YYYY/MM/DD
    const birthDate = new Date(birthDateStr.replace(/\//g, '-'));
    
    // Parse reference date or use current date
    let refDate: Date;
    if (referenceDateStr) {
      // Try parsing the localized string if it's what we have, 
      // though ISO is much safer.
      const parsedRef = new Date(referenceDateStr);
      refDate = isNaN(parsedRef.getTime()) ? new Date() : parsedRef;
    } else {
      refDate = new Date();
    }
    
    if (isNaN(birthDate.getTime())) return null;
    
    let age = refDate.getFullYear() - birthDate.getFullYear();
    const monthDiff = refDate.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && refDate.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age >= 0 ? age : 0;
  } catch (e) {
    return null;
  }
}
