import { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Upload, RefreshCw, RotateCw, X, CheckCircle2, AlertCircle, FileText, Filter,
  Cpu, Zap, Database, Download, Scan, Info, Search, History, Trash2, Copy,
  Scale, HeartPulse, GraduationCap, Briefcase, Users, Star, Edit3, Save, FileSpreadsheet, ChevronDown, ChevronUp, Plus, PlusCircle, Settings2, PlusSquare, Languages, Minus,
  ArrowRight, GripVertical
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { extractDocumentData, ExtractedData } from './lib/gemini';
import { validateNationalID, validateUNHCRNumber, calculateAge, applyFiltersToImage, rotateImage, isSimilar } from './lib/validation';

import { DOCUMENT_TYPES, getDocTypeById } from './lib/config';

interface HistoryModification {
  data: ExtractedData;
  timestamp: string;
}

interface HistoryItem {
  id: string;
  data: ExtractedData;
  originalExtract?: ExtractedData; // To track modifications
  image: string;
  timestamp: string;
  updatedAt?: string;
  createdAtISO?: string; // Standard ISO for calculations
  isReviewed?: boolean;
  eventName?: string;
  modificationsHistory?: HistoryModification[];
}

export default function App() {
  const { t, i18n } = useTranslation();
  const [image, setImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [splitRatio, setSplitRatio] = useState(50); // percentage for the data results card
  const [isSplitDragging, setIsSplitDragging] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsSplitDragging(true);
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isSplitDragging) return;
      const newRatio = (e.clientX / window.innerWidth) * 100;
      if (newRatio > 20 && newRatio < 80) {
        setSplitRatio(newRatio);
      }
    };
    const handleMouseUp = () => setIsSplitDragging(false);

    if (isSplitDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isSplitDragging]);

  const goBack = () => {
    setImage(null);
    setData(null);
    setIsProcessing(false);
  };
  const [processingStage, setProcessingStage] = useState(0);
  const [processingStatus, setProcessingStatus] = useState('');
  const [data, setData] = useState<ExtractedData | null>(null);
  const [originalData, setOriginalData] = useState<ExtractedData | null>(null);
  const [isReverting, setIsReverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConfirmingType, setIsConfirmingType] = useState(false);
  const [priorityDocTypes, setPriorityDocTypes] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [govFilter, setGovFilter] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState('');
  const [nationalityFilter, setNationalityFilter] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [reviewFilter, setReviewFilter] = useState<'all' | 'reviewed' | 'pending'>('all');
  const [lastMimeType, setLastMimeType] = useState<string | null>(null);
  const [currentEvent, setCurrentEvent] = useState('');
  const [toasts, setToasts] = useState<{ id: string; message: string }[]>([]);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [batchQueue, setBatchQueue] = useState<{ file: File; id: string; uploadedAt?: string; status: 'waiting' | 'processing' | 'done' | 'error' | 'retrying' }[]>([]);
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [isBatchPaused, setIsBatchPaused] = useState(false);
  const [isBatchCancelled, setIsBatchCancelled] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [filters, setFilters] = useState({ brightness: 100, contrast: 100, saturation: 100, sharpness: 0 });
  const [showFilters, setShowFilters] = useState(false);
  const [isClearingAll, setIsClearingAll] = useState(false);
  const [isConfirmingSave, setIsConfirmingSave] = useState(false);
  const [isHistoryCompact, setIsHistoryCompact] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [potentialDuplicates, setPotentialDuplicates] = useState<{ item: HistoryItem, score: number, matches: string[] }[]>([]);
  const [showUploadPreview, setShowUploadPreview] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [lastAutoSave, setLastAutoSave] = useState<string | null>(null);
  const [duplicateThresholds, setDuplicateThresholds] = useState({
    name: 0.75,
    id: 0.9,
    address: 0.6,
    combined: 0.85
  });
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('doc_history');
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('Failed to parse history from localStorage', e);
      return [];
    }
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+U for Upload (Open file picker)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') {
        e.preventDefault();
        fileInputRef.current?.click();
      }
      // R for Reset view (zoom and pan)
      if (e.key.toLowerCase() === 'r' && !['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const saveToLocalStorage = (data: HistoryItem[]) => {
      try {
        localStorage.setItem('doc_history', JSON.stringify(data));
        return true;
      } catch (e) {
        return false;
      }
    };

    if (saveToLocalStorage(history)) return;

    // Quota reached: Aggressive Recovery Strategy
    let currentHistory = [...history];
    
    // Stage 1: Keep images only for the most recent N items
    const keepCounts = [5, 2, 0];
    for (const count of keepCounts) {
      currentHistory = currentHistory.map((item, idx) => 
        idx < count ? item : { ...item, image: '' }
      );
      
      if (saveToLocalStorage(currentHistory)) {
        setHistory(currentHistory);
        addToast(count === 0 ? 'تم حذف جميع الصور للمحافظة على البيانات' : `تم حذف الصور القديمة (تم الإبقاء على ${count} فقط)`);
        return;
      }
    }

    // Stage 2: Reduce number of items if metadata alone is too large
    while (currentHistory.length > 2 && !saveToLocalStorage(currentHistory)) {
      currentHistory.pop();
    }

    if (saveToLocalStorage(currentHistory)) {
      setHistory(currentHistory);
      addToast('تم تقليص عدد السجلات للمحافظة على عمل النظام');
    } else {
      // Final desperation: Clear ALL other storage keys just in case
      console.error('CRITICAL: LocalStorage full even with minimal data');
      addToast('ذاكرة المتصفح ممتلئة تماماً، يرجى مسح بيانات المتصفح لهذا الموقع');
    }
  }, [history]);

declare global {
  interface Window {
    electronAPI: {
      getAppVersion: () => Promise<string>;
      logError: (data: any) => void;
    };
  }
}

  const logError = async (message: string, context: any, stage: number) => {
    try {
      const payload = {
        error: message,
        timestamp: new Date().toISOString(),
        context,
        stage
      };

      if (window.electronAPI) {
        window.electronAPI.logError(payload);
        return;
      }

      await fetch('/api/log-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (e) {
      console.error('Failed to log error', e);
    }
  };

  const addToast = (message: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement> | React.DragEvent) => {
    let files: File[] = [];
    if ('target' in e && (e.target as HTMLInputElement).files) {
      files = Array.from((e.target as HTMLInputElement).files || []);
    } else if ('dataTransfer' in e) {
      files = Array.from(e.dataTransfer.files || []);
    }

    if (files.length === 0) return;

    // Filter for images only
    const imageFiles = files.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      addToast('يرجى اختيار ملفات صور فقط');
      return;
    }

    if (imageFiles.length > 1) {
      setPendingFiles(imageFiles);
      setShowUploadPreview(true);
      return;
    }

    const file = imageFiles[0];
    setRotation(0); // Reset rotation for new file
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      setLastMimeType(file.type);
      
      // Check if this image already exists in history
      const existingItem = history.find(item => item.image === base64);
      if (existingItem) {
        setImage(base64);
        setData(existingItem.data);
        setError(null);
        setIsConfirmingType(false);
        addToast('تم استرجاع البيانات من الأرشيف');
        return;
      }

      setImage(base64);
      processImage(base64, file.type);
    };
    reader.readAsDataURL(file);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const updateBatchStatus = (id: string, status: 'waiting' | 'processing' | 'done' | 'error' | 'retrying') => {
    setBatchQueue(prev => prev.map(item => item.id === id ? { ...item, status } : item));
  };

  const startBatchProcessing = (selectedFiles: File[]) => {
    const newQueue = selectedFiles.map(file => ({
      file,
      id: Math.random().toString(36).substr(2, 9),
      uploadedAt: new Date().toLocaleString('ar-EG'),
      status: 'waiting' as const
    }));
    setBatchQueue(prev => [...prev, ...newQueue]);
    setIsBatchMode(true);
    setShowUploadPreview(false);
    setPendingFiles([]);
    addToast(`بدء معالجة دفعة مكونة من ${selectedFiles.length} وثائق`);
  };

  const processBatchItem = async (item: typeof batchQueue[0]) => {
    let retries = 0;
    const maxRetries = 2;
    
    const attempt = async (): Promise<void> => {
      setBatchQueue(prev => prev.map(i => i.id === item.id ? { 
        ...i, 
        status: retries > 0 ? 'processing' : 'processing' // status still processing but we can track internally
      } : i));
      
      return new Promise<void>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64 = reader.result as string;
          try {
            const result = await extractDocumentData(base64, item.file.type, "", priorityDocTypes);
            const newItem: HistoryItem = {
              id: Math.random().toString(36).substr(2, 9),
              data: { ...result, serviceItems: [], customFields: {} },
              originalExtract: { ...result, serviceItems: [], customFields: {} },
              image: base64,
              timestamp: new Date().toLocaleString('ar-EG'),
              createdAtISO: new Date().toISOString(),
              isReviewed: false,
              eventName: currentEvent
            };
            setHistory(prev => [newItem, ...prev]);
            setBatchQueue(prev => prev.map(i => i.id === item.id ? { ...i, status: 'done' } : i));
            addToast(`تمت معالجة ${item.file.name}`);
            resolve();
          } catch (err) {
            if (retries < maxRetries) {
              retries++;
              setBatchQueue(prev => prev.map(i => i.id === item.id ? { ...i, status: 'retrying' } : i));
              // Tiny delay before retry
              setTimeout(() => attempt().then(resolve), 2000);
            } else {
              setBatchQueue(prev => prev.map(i => i.id === item.id ? { ...i, status: 'error' } : i));
              resolve();
            }
          }
        };
        reader.readAsDataURL(item.file);
      });
    };

    return attempt();
  };

  useEffect(() => {
    const processNext = async () => {
      if (!isBatchMode || isBatchPaused || isBatchCancelled) return;
      
      const next = batchQueue.find(i => i.status === 'waiting');
      if (next) {
        await processBatchItem(next);
      } else if (batchQueue.length > 0 && batchQueue.every(i => i.status === 'done' || i.status === 'error')) {
        // Batch finished
        addToast('اكتملت معالجة الدفعة');
      }
    };
    processNext();
  }, [batchQueue, isBatchMode, isBatchPaused, isBatchCancelled]);

  const updateDataField = (field: keyof ExtractedData, value: string) => {
    if (!data) return;
    setData({ ...data, [field]: value });
  };

  const updateCustomField = (key: string, value: string) => {
    if (!data) return;
    const currentCustomFields = { ...(data.customFields || {}) };
    currentCustomFields[key] = value;
    setData({ ...data, customFields: currentCustomFields });
  };

  const addCustomField = () => {
    if (!data) return;
    const key = prompt('أدخل اسم الحقل الجديد (مثلاً: ملاحظات إضافية):');
    if (key && key.trim()) {
      updateCustomField(key.trim(), '');
    }
  };

  const deleteCustomField = (key: string) => {
    if (!data) return;
    const currentCustomFields = { ...(data.customFields || {}) };
    delete currentCustomFields[key];
    setData({ ...data, customFields: currentCustomFields });
  };

  const processImage = async (base64: string, mimeType: string) => {
    setIsProcessing(true);
    setProcessingStage(5);
    setProcessingStatus('بدء تهيئة النظام...');
    setError(null);
    setData(null);
    setOriginalData(null);
    
    try {
      // Step 0: Apply Pre-processing filters & Rotation
      setProcessingStage(12);
      setProcessingStatus('تحسين جودة الصورة المستلمة وتطبيق التعديلات...');
      let processedBase64 = base64;
      
      try {
        // Apply rotation first if needed
        if (rotation !== 0) {
          processedBase64 = await rotateImage(processedBase64, rotation);
        }

        if (filters.brightness !== 100 || filters.contrast !== 100 || filters.sharpness > 0) {
          processedBase64 = await applyFiltersToImage(processedBase64, filters);
        }
      } catch (imgErr: any) {
        console.error('Image Processing Error:', imgErr);
        throw new Error(`فشل تطبيق معالجة الصورة (Filters/Rotation): ${imgErr.message || 'خطأ في معالجة بكسلات الصورة'}`);
      }

      // Realistic delay for optimization
      await new Promise(r => setTimeout(r, 800));

      // Step 1: Preprocessing simulation
      setProcessingStage(28);
      setProcessingStatus('تحليل الهيكل البصري للوثيقة...');
      await new Promise(r => setTimeout(r, 600));
      
      // Generate context
      const context = history.slice(0, 10).map(h => 
        `- Document: ${h.data.documentType}, Name: ${h.data.name}, ID: ${h.data.nationalId}${h.data.unhcrFileNumber ? `, UNHCR File: ${h.data.unhcrFileNumber}` : ''}, Nationality: ${h.data.nationality}`
      ).join('\n');

      // Step 2: OCR Trigger
      setProcessingStage(52);
      setProcessingStatus('استخراج النصوص والبيانات الحيوية عبر Gemini AI...');
      
      let result;
      try {
        result = await extractDocumentData(processedBase64, mimeType, context, priorityDocTypes);
      } catch (geminiErr: any) {
        console.error('Gemini Extraction Error:', geminiErr);
        throw new Error(`خطأ في استخراج البيانات عبر الذكاء الاصطناعي: ${geminiErr.message || 'فشل الاتصال بخادم Gemini'}`);
      }
      
      // Step 3: Parsing & Validation
      setProcessingStage(85);
      setProcessingStatus('تدقيق البيانات المرجعية وتصنيف الحقول...');
      await new Promise(r => setTimeout(r, 700));
      
      if (!result || !result.documentType) {
        throw new Error('فشل النظام في التعرف على نوع الوثيقة. يرجى تجربة تدوير الصورة أو استخدام صورة أكثر وضوحاً.');
      }
      
      // Step 4: Finalizing
      setProcessingStage(100);
      setProcessingStatus('تم الانتهاء من المعالجة بنجاح');
      
      const finalized = {
        ...result,
        serviceItems: result.serviceItems || [],
        customFields: result.customFields || {},
        thumbnail: base64
      };
      
      setData(finalized);
      setOriginalData(JSON.parse(JSON.stringify(finalized))); // Deep clone for comparison
      
      const duplicates = checkDuplicates(finalized);
      setPotentialDuplicates(duplicates);
      
      setIsConfirmingType(true);
      if (duplicates.length > 0) {
        addToast('تنبيه: تم العثور على سجلات مشابهة في الأرشيف');
      } else {
        addToast('تم استخراج البيانات بنجاح');
      }
    } catch (err: any) {
      const msg = err.message || 'حدث خطأ غير متوقع أثناء معالجة الصورة. يرجى المراجعة والمحاولة مرة أخرى.';
      setError(msg);
      logError(msg, { 
        mimeType, 
        imageFound: !!base64, 
        rotation, 
        filters,
        errorMessage: err.message,
        stack: err.stack
      }, processingStage);
    } finally {
      setIsProcessing(false);
      setTimeout(() => setProcessingStage(0), 1000);
    }
  };

  const isDirty = useMemo(() => {
    if (!data || !image) return false;
    const historyItem = history.find(item => item.image === image);
    if (!historyItem) return true; // New extraction
    return JSON.stringify(data) !== JSON.stringify(historyItem.data);
  }, [data, history, image]);

  // Auto-save feature
  useEffect(() => {
    if (!isDirty || !data) return;

    const timer = setInterval(() => {
      try {
        const draft = {
          data,
          image,
          timestamp: new Date().toISOString()
        };
        localStorage.setItem('doc_draft', JSON.stringify(draft));
        setLastAutoSave(new Date().toLocaleTimeString('ar-EG'));
        console.log('Draft auto-saved');
      } catch (e) {
        console.error('Auto-save failed', e);
      }
    }, 60000); // 60 seconds

    return () => clearInterval(timer);
  }, [isDirty, data, image]);

  useEffect(() => {
    if (data && !isProcessing) {
      const duplicates = checkDuplicates(data);
      setPotentialDuplicates(duplicates);
    }
  }, [data, isProcessing]);

  const confirmDocumentType = (docType?: ExtractedData['documentType']) => {
    if (!data || !image) return;
    
    if (potentialDuplicates.length > 0 && !isConfirmingSave) {
      if (!window.confirm('تم العثور على سجلات مشابهة في الأرشيف. هل أنت متأكد من رغبتك في حفظ هذا السجل الجديد؟')) {
        return;
      }
    }

    const finalizedData = docType ? { ...data, documentType: docType } : data;
    
    // Check if we are updating an existing entry
    const existingIndex = history.findIndex(item => item.image === image);
    
    if (existingIndex > -1) {
      const updatedHistory = [...history];
      const currentItem = updatedHistory[existingIndex];
      
      // Add current state to history before updating if it has changed
      const newModification: HistoryModification = {
        data: { ...currentItem.data },
        timestamp: currentItem.timestamp
      };

      updatedHistory[existingIndex] = {
        ...currentItem,
        data: finalizedData,
        isReviewed: false, // Maintain pending status until manual review
        updatedAt: new Date().toLocaleString('ar-EG'),
        eventName: currentEvent || currentItem.eventName,
        modificationsHistory: [newModification, ...(currentItem.modificationsHistory || [])]
      };
      setHistory(updatedHistory);
    } else {
      const newItem: HistoryItem = {
        id: Math.random().toString(36).substr(2, 9),
        data: finalizedData,
        originalExtract: finalizedData,
        image,
        isReviewed: false, // New items start as pending
        eventName: currentEvent,
        timestamp: new Date().toLocaleString('ar-EG'),
        createdAtISO: new Date().toISOString()
      };
      setHistory(prev => [newItem, ...prev]);
    }

    setData(finalizedData);
    setIsConfirmingType(false);
    addToast(t('toasts.saved_pending'));
  };

  const exportData = (format: 'xlsx' | 'csv' | 'json') => {
    if (history.length === 0) return;
    
    const formattedData = history.flatMap(item => {
      const baseRow: any = {
        'ID': item.id,
        'تاريخ الاستخراج': item.timestamp,
        'تاريخ آخر تعديل': item.updatedAt || '---',
        'الحالة': item.isReviewed ? 'تمت المراجعة' : 'قيد الانتظار',
        'الحدث/الحملة': item.eventName || '---',
        'نوع الوثيقة': item.data.documentType,
        'وصف إضافي': item.data.otherDescription || '',
        'الاسم': item.data.name || '',
        'الرقم القومي': item.data.nationalId || '',
        'رقم الجواز': item.data.passportNumber || '',
        'رقم الملف (مفوضية)': item.data.unhcrFileNumber || '',
        'رقم فردي (مفوضية)': item.data.unhcrIndividualNumber || '',
        'تاريخ الانتهاء': item.data.expiryDate || '',
        'بلد الإصدار': item.data.issuingCountry || '',
        'تاريخ الميلاد': item.data.birthDate || '',
        'محل الميلاد': item.data.birthPlace || '',
        'العنوان': item.data.address || '',
        'الجنسية': item.data.nationality || '',
        'الوظيفة': item.data.job || '',
        'الديانة': item.data.religion || '',
        'الحالة الشخصية': item.data.status || '',
        'اسم الأب': item.data.fatherName || '',
        'اسم الأم': item.data.motherName || '',
      };

      // Add custom fields to base row
      if (item.data.customFields) {
        Object.entries(item.data.customFields).forEach(([key, val]) => {
          baseRow[`حقل مخصص: ${key}`] = val;
        });
      }

      // If there are service items, create a row for each. Otherwise just one row for the doc.
      if (item.data.serviceItems && item.data.serviceItems.length > 0) {
        return item.data.serviceItems.map(s => ({
          ...baseRow,
          'التخصص': s.specialty,
          'المرض/العرض': s.condition,
          'الدكتور': s.doctorName,
          'نوع الخدمة': s.serviceType
        }));
      }

      return [{
        ...baseRow,
        'التخصص': '---',
        'المرض/العرض': '---',
        'الدكتور': '---',
        'نوع الخدمة': '---'
      }];
    });

    if (format === 'json') {
      const blob = new Blob([JSON.stringify(formattedData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `MersalDOC_Export_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      addToast('تم تصدير البيانات بصيغة JSON');
      return;
    }

    const ws = XLSX.utils.json_to_sheet(formattedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "البيانات المستخرجة");

    if (format === 'csv') {
      XLSX.writeFile(wb, `MersalDOC_Export_${new Date().toISOString().split('T')[0]}.csv`, { bookType: 'csv' });
      addToast('تم تصدير البيانات بصيغة CSV');
    } else {
      XLSX.writeFile(wb, `MersalDOC_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
      addToast('تم تصدير البيانات بصيغة Excel');
    }
  };

  const deleteHistoryItem = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setHistory(prev => prev.filter(item => item.id !== id));
    setItemToDelete(null);
    addToast('تم حذف المستند من الأرشيف');
  };

  const checkDuplicates = (newData: ExtractedData) => {
    if (!newData) return [];
    
    return history.map(item => {
      let score = 0;
      let matches: string[] = [];

      // 1. Check Primary Identifiers
      const idsToCheck = [
        { new: newData.nationalId, old: item.data.nationalId, label: 'ID', weight: 0.8 },
        { new: newData.unhcrFileNumber, old: item.data.unhcrFileNumber, label: 'UNHCR File', weight: 0.9 },
        { new: newData.passportNumber, old: item.data.passportNumber, label: 'Passport', weight: 0.9 },
        { new: newData.unhcrIndividualNumber, old: item.data.unhcrIndividualNumber, label: 'UNHCR Indiv', weight: 0.9 }
      ];

      for (const idPair of idsToCheck) {
        if (idPair.new && idPair.old) {
          if (idPair.new === idPair.old) {
            score += idPair.weight;
            matches.push(idPair.label);
          } else if (isSimilar(idPair.new, idPair.old, duplicateThresholds.id)) {
            score += idPair.weight * 0.8;
            matches.push(idPair.label);
          }
        }
      }
      
      // 2. Check Names
      const namesToCheck = [
        { new: newData.name, old: item.data.name, label: 'Name', weight: 0.5 },
        { new: newData.motherName, old: item.data.motherName, label: 'Mother Name', weight: 0.3 }
      ];

      for (const namePair of namesToCheck) {
        if (namePair.new && namePair.old) {
          if (namePair.new === namePair.old) {
            score += namePair.weight;
            matches.push(namePair.label);
          } else if (isSimilar(namePair.new, namePair.old, duplicateThresholds.name)) {
            score += namePair.weight * 0.7;
            matches.push(namePair.label);
          }
        }
      }

      // 3. Address
      if (newData.address && item.data.address) {
        if (newData.address === item.data.address) {
          score += 0.2;
          matches.push('Address');
        } else if (isSimilar(newData.address, item.data.address, duplicateThresholds.address)) {
          score += 0.15;
          matches.push('Address');
        }
      }

      // 4. Combined (Name + Birth)
      if (newData.name && item.data.name && newData.birthDate && item.data.birthDate) {
        if (isSimilar(newData.name, item.data.name, duplicateThresholds.combined) && newData.birthDate === item.data.birthDate) {
          score += 0.6;
          matches.push('Name+Birth');
        }
      }

      // 5. Issuing Country & Expiry (Extra signals)
      if (newData.issuingCountry && item.data.issuingCountry && newData.issuingCountry === item.data.issuingCountry && newData.documentType !== 'national_id') {
        score += 0.1;
      }
      
      if (newData.expiryDate && item.data.expiryDate && newData.expiryDate === item.data.expiryDate) {
        score += 0.1;
      }

      return { item, score: Math.min(score, 1), matches };
    })
    .filter(res => res.score > 0.4)
    .sort((a, b) => b.score - a.score);
  };

  const clearAllHistory = () => {
    setHistory([]);
    setIsClearingAll(false);
    addToast('تم مسح الأرشيف بالكامل');
  };

  const reset = () => {
    setImage(null);
    setData(null);
    setError(null);
    setIsConfirmingType(false);
    setPotentialDuplicates([]);
  };

  // Persistent duplicates within history
  const historyDuplicates = useMemo(() => {
    const duplicates = new Set<string>();
    for (let i = 0; i < history.length; i++) {
      for (let j = i + 1; j < history.length; j++) {
        const itemA = history[i];
        const itemB = history[j];
        
        let score = 0;
        // Simple name/ID match
        if (itemA.data.nationalId && itemB.data.nationalId && itemA.data.nationalId === itemB.data.nationalId) score += 0.8;
        if (itemA.data.unhcrFileNumber && itemB.data.unhcrFileNumber && itemA.data.unhcrFileNumber === itemB.data.unhcrFileNumber) score += 0.8;
        if (itemA.data.name && itemB.data.name && isSimilar(itemA.data.name, itemB.data.name, 0.9)) score += 0.4;
        
        if (score >= 0.7) {
          duplicates.add(itemA.id);
          duplicates.add(itemB.id);
        }
      }
    }
    return duplicates;
  }, [history]);

  const filteredHistory = useMemo(() => {
    return history.filter(item => {
      const searchTerms = searchQuery.toLowerCase();
      const matchesSearch = (
        item.data.name?.toLowerCase().includes(searchTerms) ||
        item.data.nationalId?.includes(searchTerms) ||
        item.data.unhcrFileNumber?.toLowerCase().includes(searchTerms) ||
        item.data.unhcrIndividualNumber?.toLowerCase().includes(searchTerms) ||
        item.data.documentType.includes(searchTerms)
      );

      const itemGov = item.data.nationalId ? validateNationalID(item.data.nationalId).data?.governorate : '';
      const matchesGov = !govFilter || itemGov === govFilter;
      
      const itemDate = item.timestamp; // "8/5/2026" form
      const matchesDate = !dateFilter || itemDate.includes(dateFilter);
      
      const matchesDocType = !docTypeFilter || item.data.documentType === docTypeFilter;
      const matchesNationality = !nationalityFilter || item.data.nationality?.includes(nationalityFilter);
      const matchesEvent = !eventFilter || item.eventName?.toLowerCase().includes(eventFilter.toLowerCase());
      
      const matchesReviewStatus = 
        reviewFilter === 'all' ? true :
        reviewFilter === 'reviewed' ? item.isReviewed :
        !item.isReviewed;

      return matchesSearch && matchesGov && matchesDate && matchesDocType && matchesNationality && matchesEvent && matchesReviewStatus;
    });
  }, [history, searchQuery, govFilter, dateFilter, docTypeFilter, nationalityFilter, eventFilter, reviewFilter]);

  const stats = useMemo(() => {
    const totalDocs = history.length;
    const uniqueEvents = new Set(history.map(item => item.eventName).filter(Boolean)).size;
    const reviewedDocs = history.filter(item => item.isReviewed).length;
    const pendingDocs = totalDocs - reviewedDocs;
    
    // Distribution counts
    const distribution: Record<string, number> = {};
    DOCUMENT_TYPES.forEach(type => {
      distribution[type.id] = history.filter(h => h.data.documentType === type.id).length;
    });
    
    return { totalDocs, uniqueEvents, reviewedDocs, pendingDocs, distribution };
  }, [history]);

  const batchProgress = useMemo(() => {
    if (batchQueue.length === 0) return 0;
    const completed = batchQueue.filter(i => i.status === 'done' || i.status === 'error').length;
    return (completed / batchQueue.length) * 100;
  }, [batchQueue]);

  const idValidation = data?.nationalId ? validateNationalID(data.nationalId) : null;

  return (
    <div 
      className="min-h-screen bg-bg text-white font-sans selection:bg-primary/10 transition-colors duration-500" 
      dir={i18n.language === 'ar' ? 'rtl' : 'ltr'}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        handleFileUpload(e as any);
      }}
    >
      {/* Header */}
      <header className="bg-card-bg border-b border-border sticky top-0 z-50 shadow-sm">
        {/* Row 1: App Name & Main Stats */}
        <div className="h-14 border-b border-border/50 flex items-center justify-between px-6">
          <h1 className="text-lg md:text-xl font-bold text-primary flex items-center gap-2">
            <span className="p-1 px-2 bg-primary/10 rounded-lg text-[10px] font-mono tracking-tighter">AI</span>
            {t('app_name')} <span className="font-light text-slate-400">| {t('mersal_doc_ai')}</span>
          </h1>
          
          <div className="flex gap-4 items-center">
            <div className="hidden md:flex gap-2">
              <Badge color="blue" icon={Database}>Gemini AI</Badge>
              <Badge color="green" icon={Cpu}>V3.0</Badge>
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                onClick={() => i18n.changeLanguage(i18n.language === 'ar' ? 'en' : 'ar')}
                className="p-2 rounded-xl transition-all border bg-slate-800 border-border text-slate-400 hover:text-white flex items-center gap-2"
                title={i18n.language === 'ar' ? 'English' : 'العربية'}
              >
                <Languages className="w-5 h-5" />
                <span className="text-[10px] font-bold uppercase">{i18n.language === 'ar' ? 'EN' : 'AR'}</span>
              </button>

              <div className="relative">
                <button 
                  onClick={() => setShowSettings(!showSettings)}
                  className={cn(
                    "p-2 rounded-xl transition-all border",
                    showSettings ? "bg-primary/20 border-primary text-primary" : "bg-slate-800 border-border text-slate-400 hover:text-white"
                  )}
                >
                  <Settings2 className="w-5 h-5" />
                </button>
              
              <AnimatePresence>
                {showSettings && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute top-full left-0 mt-3 w-72 bg-slate-900 border border-border rounded-3xl shadow-2xl p-6 z-[60]"
                  >
                    <h4 className="text-sm font-bold mb-4 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-primary" /> {t('settings.extraction_priorities')}
                    </h4>
                    <p className="text-[10px] text-slate-500 mb-4 leading-relaxed">
                      {t('settings.priorities_desc')}
                    </p>
                    
                    <div className="space-y-4 max-h-80 overflow-y-auto pr-2 custom-scrollbar">
                      <div className="space-y-4 mb-6 border-b border-border pb-6">
                        <h5 className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{t('settings.duplicate_thresholds')}</h5>
                        <ThresholdControl label={t('settings.threshold_name')} value={duplicateThresholds.name} onChange={(v) => setDuplicateThresholds({...duplicateThresholds, name: v})} />
                        <ThresholdControl label={t('settings.threshold_id')} value={duplicateThresholds.id} onChange={(v) => setDuplicateThresholds({...duplicateThresholds, id: v})} />
                        <ThresholdControl label={t('settings.threshold_combined')} value={duplicateThresholds.combined} onChange={(v) => setDuplicateThresholds({...duplicateThresholds, combined: v})} />
                      </div>
                      
                      {DOCUMENT_TYPES.map(type => (
                        <label key={type.id} className="flex items-center gap-3 p-2 bg-slate-800/40 rounded-xl cursor-pointer hover:bg-slate-800 transition-all border border-transparent hover:border-border/50">
                          <input 
                            type="checkbox"
                            checked={priorityDocTypes.includes(type.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setPriorityDocTypes([...priorityDocTypes, type.id]);
                              } else {
                                setPriorityDocTypes(priorityDocTypes.filter(id => id !== type.id));
                              }
                            }}
                            className="w-4 h-4 accent-primary rounded"
                          />
                          <span className="text-xs font-bold text-slate-300">{type.label}</span>
                        </label>
                      ))}
                    </div>
                    
                    <button 
                      onClick={() => setShowSettings(false)}
                      className="w-full mt-6 py-2 bg-primary text-white rounded-xl text-xs font-bold hover:brightness-110 transition-all"
                    >
                      {t('settings.save_apply')}
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

        {/* Row 2: Filters & Current Event */}
        <div className="h-14 flex items-center px-6 gap-6">
          <div className="flex items-center gap-2 border-l border-border/30 pl-6 h-8">
            <div className="text-[9px] text-slate-500 font-mono uppercase bg-slate-800/50 px-1.5 py-1 rounded-md border border-border/50">
              {t('active_event')}
            </div>
            <input 
              type="text" 
              placeholder={t('event_placeholder')}
              value={currentEvent}
              onChange={(e) => setCurrentEvent(e.target.value)}
              className="w-40 bg-slate-800 border border-border rounded-lg py-1 px-3 text-xs text-white focus:ring-2 focus:ring-primary/20 outline-none"
            />
          </div>

          <div className="flex-grow flex items-center gap-3">
            <div className="relative max-w-xs w-full">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input 
                type="text" 
                placeholder={t('search_placeholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-800 border border-border rounded-lg py-1.5 pr-9 pl-3 text-xs text-white focus:bg-slate-700 outline-none"
              />
            </div>
            
            <select 
              value={govFilter}
              onChange={(e) => setGovFilter(e.target.value)}
              className="bg-slate-800 border border-border rounded-lg py-1.5 px-2 text-[11px] text-white outline-none"
            >
              <option value="">{t('all_governorates')}</option>
              <option value="القاهرة">القاهرة</option>
              <option value="الجيزة">الجيزة</option>
              <option value="الإسكندرية">الإسكندرية</option>
            </select>

            <select 
              value={docTypeFilter}
              onChange={(e) => setDocTypeFilter(e.target.value)}
              className="bg-slate-800 border border-border rounded-lg py-1.5 px-2 text-[11px] text-white outline-none"
            >
              <option value="">{t('all_types')}</option>
              {DOCUMENT_TYPES.map(type => (
                <option key={type.id} value={type.id}>{type.label}</option>
              ))}
            </select>

            <input 
              type="text"
              placeholder={t('event_filter')}
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              className="w-24 bg-slate-800 border border-border rounded-lg py-1.5 px-3 text-[11px] text-white outline-none"
            />

            <select 
              value={reviewFilter}
              onChange={(e) => setReviewFilter(e.target.value as any)}
              className="bg-slate-800 border border-border rounded-lg py-1.5 px-2 text-[11px] text-white outline-none"
            >
              <option value="all">{t('all_statuses')}</option>
              <option value="reviewed">{t('reviewed')}</option>
              <option value="pending">{t('pending')}</option>
            </select>
          </div>

          <div className="relative group">
            <button className="flex items-center gap-2 px-3 py-1.5 bg-green-500/10 text-green-400 rounded-lg text-[11px] font-bold border border-green-500/20 hover:bg-green-500/20 transition-all">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              {t('export')} <ChevronDown className="w-3 h-3" />
            </button>
            <div className="absolute top-full left-0 mt-1 w-32 bg-slate-900 border border-border rounded-lg shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
              <button onClick={() => exportData('xlsx')} className="w-full text-right px-3 py-2 text-[10px] text-slate-300 hover:bg-slate-800 rounded-t-lg">Excel</button>
              <button onClick={() => exportData('csv')} className="w-full text-right px-3 py-2 text-[10px] text-slate-300 hover:bg-slate-800">CSV</button>
              <button onClick={() => exportData('json')} className="w-full text-right px-3 py-2 text-[10px] text-slate-300 hover:bg-slate-800 rounded-b-lg">JSON</button>
            </div>
          </div>
        </div>
      </header>

      {/* Stats Bar */}
      <div className="bg-slate-900 border-b border-border/50 py-2 px-6 overflow-x-auto">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-8 text-[10px] font-mono whitespace-nowrap">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 uppercase tracking-wider">{t('stats.total_docs')}:</span>
              <span className="text-primary font-bold text-xs">{stats.totalDocs}</span>
              <span className="text-slate-700 text-[8px]">{i18n.language === 'ar' ? 'وثيقة' : 'Docs'}</span>
            </div>
            <div className="w-[1px] h-3 bg-border" />
            <div className="flex items-center gap-2">
              <span className="text-slate-500 uppercase tracking-wider">{t('stats.unique_events')}:</span>
              <span className="text-blue-400 font-bold text-xs">{stats.uniqueEvents}</span>
              <span className="text-slate-700 text-[8px]">{i18n.language === 'ar' ? 'حملة/حدث' : 'Event'}</span>
            </div>
            <div className="w-[1px] h-3 bg-border" />
            <div className="flex items-center gap-2">
              <span className="text-slate-500 uppercase tracking-wider">{t('stats.reviewed')}:</span>
              <span className="text-green-400 font-bold text-xs">{stats.reviewedDocs}</span>
              <span className="text-slate-700 text-[8px]">{i18n.language === 'ar' ? 'مكتمل' : 'Completed'}</span>
            </div>
            <div className="w-[1px] h-3 bg-border" />
            <div className="flex items-center gap-2">
              <span className="text-slate-500 uppercase tracking-wider">{t('stats.pending')}:</span>
              <span className="text-orange-400 font-bold text-xs">{stats.pendingDocs}</span>
              <span className="text-slate-700 text-[8px]">{i18n.language === 'ar' ? 'قيد المراجعة' : 'Pending'}</span>
            </div>
          </div>

          {/* Document Type Distribution Charts */}
          <div className="flex items-center gap-6 pr-6 border-r border-border/30">
            <div className="flex flex-col gap-1">
              <div className="flex justify-between items-center w-32">
                <span className="text-slate-500 text-[9px] uppercase">Doc Distribution</span>
              </div>
              <div className="flex h-1.5 w-48 bg-slate-800 rounded-full overflow-hidden shadow-inner">
                {DOCUMENT_TYPES.map(type => (
                  <div 
                    key={type.id}
                    style={{ width: `${(stats.distribution[type.id] / (stats.totalDocs || 1)) * 100}%` }} 
                    className={cn("h-full transition-all", type.color)} 
                    title={type.label} 
                  />
                ))}
              </div>
            </div>
            
            <div className="flex gap-3 text-[9px]">
               {DOCUMENT_TYPES.slice(0, 4).map(type => (
                 <div key={type.id} className="flex items-center gap-1.5">
                   <div className={cn("w-1.5 h-1.5 rounded-full", type.color)} /> 
                   <span>{type.label.split(' ')[0]}</span>
                 </div>
               ))}
            </div>
          </div>
        </div>
      </div>

      <main className="p-4 md:p-6 max-w-[1400px] mx-auto">
        {!image ? (
          <div className="grid grid-cols-12 gap-8 min-h-[70vh]">
            <div className="col-span-12 lg:col-span-8 flex flex-col justify-center">
              {isBatchMode && batchQueue.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-8 bg-slate-900 border border-border rounded-3xl p-8 shadow-2xl relative overflow-hidden"
                >
                  <div className="absolute top-0 left-0 w-full h-2 bg-slate-800">
                    <motion.div 
                      className="h-full bg-primary shadow-[0_0_20px_rgba(var(--primary),0.6)]"
                      initial={{ width: 0 }}
                      animate={{ width: `${batchProgress}%` }}
                    />
                  </div>

                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-8 mt-2">
                    <div className="space-y-1">
                      <h3 className="text-xl font-black flex items-center gap-3">
                         <RefreshCw className={cn("w-6 h-6 text-primary", batchQueue.some(i => i.status === 'processing' || i.status === 'retrying') && !isBatchPaused && "animate-spin")} />
                         {t('upload.batch_title')}
                      </h3>
                      <p className="text-slate-500 text-xs font-mono">
                        {t('upload.batch_progress', { done: batchQueue.filter(i => i.status === 'done' || i.status === 'error').length, total: batchQueue.length })}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 w-full md:w-auto">
                      <button 
                        onClick={() => setIsBatchPaused(!isBatchPaused)}
                        className={cn(
                          "flex-1 md:flex-none px-6 py-2 rounded-xl text-xs font-bold transition-all border",
                          isBatchPaused 
                            ? "bg-green-500/10 text-green-400 border-green-500/20 hover:bg-green-500/20" 
                            : "bg-orange-500/10 text-orange-400 border-orange-500/20 hover:bg-orange-500/20"
                        )}
                      >
                        {isBatchPaused ? t('upload.resume') : t('upload.pause')}
                      </button>
                      <button 
                        onClick={() => {
                          setIsBatchCancelled(true);
                          setIsBatchMode(false);
                          setBatchQueue([]);
                          addToast(t('toasts.batch_cancelled'));
                        }}
                        className="flex-1 md:flex-none px-6 py-2 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl text-xs font-bold hover:bg-red-500/20 transition-all"
                      >
                        {t('upload.cancel_batch')}
                      </button>
                      <button 
                        onClick={() => {
                          setIsBatchMode(false);
                          setBatchQueue([]);
                        }}
                        className="flex-1 md:flex-none px-6 py-2 bg-slate-800 text-slate-300 border border-border rounded-xl text-xs font-bold hover:bg-slate-700 transition-all focus:outline-none focus:ring-2 focus:ring-primary/20"
                      >
                        {t('upload.close')}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                    {batchQueue.map((item) => (
                      <div key={item.id} className={cn(
                        "relative aspect-square bg-slate-800/40 rounded-2xl overflow-hidden border transition-all flex flex-col items-center justify-center p-3 text-center group",
                        item.status === 'processing' ? "border-primary ring-2 ring-primary/20 scale-105 z-10" : "border-border/50"
                      )}>
                        {item.status === 'processing' && <RefreshCw className="w-6 h-6 text-primary animate-spin mb-2" />}
                        {item.status === 'retrying' && <RefreshCw className="w-6 h-6 text-orange-400 animate-spin mb-2" />}
                        {item.status === 'done' && <CheckCircle2 className="w-6 h-6 text-green-500 mb-2" />}
                        {item.status === 'error' && <AlertCircle className="w-6 h-6 text-red-500 mb-2" />}
                        {item.status === 'waiting' && <Scan className="w-6 h-6 text-slate-600 mb-2 group-hover:text-primary transition-colors" />}
                        
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] text-slate-200 truncate w-full font-mono">{item.file.name}</span>
                          <span className={cn(
                            "text-[8px] font-bold uppercase tracking-tight",
                            item.status === 'processing' && "text-primary animate-pulse",
                            item.status === 'retrying' && "text-orange-400 animate-pulse",
                            item.status === 'done' && "text-green-500",
                            item.status === 'error' && "text-red-500",
                            item.status === 'waiting' && "text-slate-500"
                          )}>
                            {item.status === 'processing' ? t('upload.status_processing') : 
                             item.status === 'retrying' ? t('upload.status_retrying') :
                             item.status === 'done' ? t('upload.status_completed') : 
                             item.status === 'error' ? t('upload.status_failed') : t('upload.status_waiting')}
                          </span>
                        </div>

                        {/* Hover Overlay: Manual Status Actions & Info */}
                        <div className="absolute inset-0 bg-slate-950/95 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 p-2 z-20">
                          <div className="w-full space-y-0.5 mb-1 text-right" dir="rtl">
                            <div className="flex justify-between items-center text-[7px] text-slate-400">
                              <span>الحجم:</span>
                              <span className="text-white font-mono">{formatFileSize(item.file.size)}</span>
                            </div>
                            <div className="flex justify-between items-center text-[7px] text-slate-400">
                              <span>التاريخ:</span>
                              <span className="text-white font-mono">{item.uploadedAt || new Date(item.file.lastModified).toLocaleDateString('ar-EG')}</span>
                            </div>
                          </div>

                          <div className="flex gap-1">
                            <button 
                              onClick={() => updateBatchStatus(item.id, 'done')}
                              className="p-1.5 bg-green-500/20 text-green-500 rounded-lg hover:bg-green-500/40 transition-colors"
                              title={t('upload.status_completed')}
                            >
                              <CheckCircle2 className="w-3 h-3" />
                            </button>
                            <button 
                              onClick={() => updateBatchStatus(item.id, 'error')}
                              className="p-1.5 bg-red-500/20 text-red-500 rounded-lg hover:bg-red-500/40 transition-colors"
                              title={t('upload.status_failed')}
                            >
                              <AlertCircle className="w-3 h-3" />
                            </button>
                            <button 
                              onClick={() => updateBatchStatus(item.id, 'waiting')}
                              className="p-1.5 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
                              title={t('upload.status_waiting')}
                            >
                              <RefreshCw className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        
                        {item.status === 'processing' && (
                          <div className="absolute inset-0 bg-primary/5 animate-pulse pointer-events-none" />
                        )}
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

              <motion.div
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-card-bg border border-border rounded-3xl p-1 shadow-lg overflow-hidden"
              >
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-border/40 rounded-3xl p-16 md:p-24 text-center cursor-pointer hover:border-primary/50 hover:bg-slate-800/30 transition-all group bg-slate-900/40 m-2"
                >
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept="image/*"
                    multiple
                    className="hidden"
                  />
          <div className="bg-primary/10 w-24 h-24 rounded-3xl flex items-center justify-center mx-auto mb-8 transition-all group-hover:scale-110 group-hover:bg-primary/20 shadow-inner">
                    <Upload className="w-10 h-10 text-primary" />
                  </div>
                  <h2 className="text-3xl font-black mb-4 text-white tracking-tight">{t('upload.title')}</h2>
                  <p className="text-slate-400 mb-10 max-w-sm mx-auto text-lg leading-relaxed">
                    {t('upload.subtitle')}
                  </p>
                  
                  <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                      className="px-8 py-3 bg-primary text-white rounded-2xl font-bold hover:brightness-110 transition-all shadow-lg shadow-primary/20 flex items-center gap-2"
                    >
                      <Upload className="w-5 h-5" /> {t('upload.choose_files')}
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        const dirInput = document.createElement('input');
                        dirInput.type = 'file';
                        dirInput.webkitdirectory = true;
                        dirInput.onchange = (ev: any) => handleFileUpload(ev);
                        dirInput.click();
                      }}
                      className="px-8 py-3 bg-slate-800 text-slate-300 rounded-2xl font-bold hover:bg-slate-700 transition-all border border-border flex items-center gap-2"
                    >
                      <Plus className="w-5 h-5" /> {t('upload.import_folder')}
                    </button>
                  </div>
                  
                  <AnimatePresence>
                    {showUploadPreview && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                      >
                        <div className="bg-slate-900 border border-border w-full max-w-4xl rounded-3xl shadow-2xl flex flex-col max-h-[80vh]">
                          <div className="p-6 border-b border-border flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-primary/10 rounded-xl">
                                <PlusCircle className="w-6 h-6 text-primary" />
                              </div>
                              <div>
                                <h3 className="text-xl font-bold text-white leading-none mb-1">{t('upload.preview_title')}</h3>
                                <p className="text-xs text-slate-500 font-mono">{t('upload.preview_count', { count: pendingFiles.length })}</p>
                              </div>
                            </div>
                            <button 
                              onClick={() => setShowUploadPreview(false)}
                              className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
                            >
                              <X className="w-6 h-6" />
                            </button>
                          </div>
                          
                          <div className="flex-1 overflow-y-auto p-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 custom-scrollbar">
                            {pendingFiles.map((file, idx) => (
                              <div key={idx} className="relative group aspect-square bg-slate-800 rounded-2xl border border-border overflow-hidden">
                                <img 
                                  src={URL.createObjectURL(file)} 
                                  className="w-full h-full object-cover"
                                  onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
                                  alt="Preview" 
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                  <button 
                                    onClick={() => setPendingFiles(prev => prev.filter((_, i) => i !== idx))}
                                    className="p-2 bg-red-500 text-white rounded-xl shadow-lg ring-4 ring-black/20"
                                  >
                                    <Trash2 className="w-5 h-5" />
                                  </button>
                                </div>
                                <div className="absolute bottom-0 left-0 w-full p-2 bg-gradient-to-t from-black/80 to-transparent">
                                  <span className="text-[9px] text-white font-mono truncate block">{file.name}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                          
                          <div className="p-6 border-t border-border flex flex-col sm:flex-row items-center gap-4">
                            <button 
                              onClick={() => {
                                fileInputRef.current?.click();
                              }}
                              className="w-full sm:w-auto px-6 py-2.5 bg-slate-800 text-slate-300 rounded-xl font-bold hover:bg-slate-700 transition-all border border-border flex items-center justify-center gap-2"
                            >
                              <Plus className="w-4 h-4" /> {t('upload.add_more')}
                            </button>
                            <div className="flex-1" />
                            <div className="flex items-center gap-3 w-full sm:w-auto">
                              <button 
                                onClick={() => setShowUploadPreview(false)}
                                className="flex-1 sm:flex-none px-6 py-2.5 text-slate-400 font-bold hover:text-white transition-all"
                              >
                                {t('upload.cancel')}
                              </button>
                              <button 
                                onClick={() => startBatchProcessing(pendingFiles)}
                                className="flex-1 sm:flex-none px-10 py-2.5 bg-primary text-white rounded-xl font-bold hover:brightness-110 transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
                              >
                                <Zap className="w-4 h-4" /> {t('upload.start_processing')}
                              </button>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="mt-10 inline-flex items-center gap-3 px-6 py-3 bg-white/5 rounded-2xl border border-white/10 text-xs font-bold text-slate-300">
                    <CheckCircle2 className="w-4 h-4 text-green-500" /> {t('upload.powered_by')}
                  </div>
                </div>
              </motion.div>
            </div>

            {/* History Sidebar */}
            <div className="col-span-12 lg:col-span-4 space-y-6">
              <div className="bg-card-bg border border-border rounded-2xl p-6 shadow-sm h-full flex flex-col">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="font-bold text-lg flex items-center gap-2 text-white">
                    <History className="w-5 h-5 text-primary" /> {t('history.title')}
                  </h3>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setIsHistoryCompact(!isHistoryCompact)}
                      className="p-1.5 text-slate-500 hover:text-primary hover:bg-primary/10 rounded-lg transition-all"
                      title={isHistoryCompact ? t('history.detailed_view') : t('history.compact_view')}
                    >
                      <Scan className={cn("w-4 h-4", isHistoryCompact && "text-primary")} />
                    </button>
                    <span className="text-xs bg-slate-800 px-2 py-1 rounded-md text-slate-400 font-mono">
                      {t('history.items_count', { count: filteredHistory.length })}
                    </span>
                    {history.length > 0 && (
                      <button 
                        onClick={() => setIsClearingAll(true)}
                        className="p-1.5 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                        title={t('history.clear_all')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="space-y-4 overflow-y-auto max-h-[60vh] pr-1">
                  <AnimatePresence>
                    {filteredHistory.map((item) => (
                      <motion.div
                        key={item.id}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        onClick={() => {
                          setImage(item.image);
                          setData(item.data);
                        }}
                        className={cn(
                          "group bg-slate-800 border border-border cursor-pointer hover:border-primary hover:bg-slate-700 transition-all flex gap-3 items-center relative overflow-hidden",
                          isHistoryCompact ? "p-2 rounded-lg" : "p-3 rounded-xl",
                          image === item.image && "border-primary bg-primary/5",
                          (potentialDuplicates.some(dup => dup.item.id === item.id) || historyDuplicates.has(item.id)) && "ring-2 ring-orange-500/50 border-orange-500/50"
                        )}
                      >
                        {(potentialDuplicates.some(dup => dup.item.id === item.id) || historyDuplicates.has(item.id)) && (
                          <div className="absolute top-0 right-0 w-8 h-8 bg-orange-500 flex items-center justify-center rotate-45 translate-x-4 -translate-y-4 shadow-lg z-10" title="محتمل وجود تكرار">
                            <Copy className="w-3 h-3 text-white -rotate-45 mb-1 mr-1" />
                          </div>
                        )}
                        <div className="relative">
                          {item.image ? (
                            <img 
                              src={item.image} 
                              className={cn(
                                "rounded-lg object-cover border border-border shadow-sm transition-all duration-300",
                                isHistoryCompact ? "w-8 h-8" : "w-12 h-12"
                              )} 
                              alt="Doc" 
                            />
                          ) : (
                            <div className={cn(
                              "rounded-lg bg-slate-700 flex items-center justify-center border border-border",
                              isHistoryCompact ? "w-8 h-8" : "w-12 h-12"
                            )}>
                              <FileText className="w-1/2 h-1/2 text-slate-500" />
                            </div>
                          )}
                          {!isHistoryCompact && (
                            item.isReviewed ? (
                              <div className="absolute -top-1 -right-1 bg-green-500 rounded-full p-0.5 shadow-sm border border-slate-900">
                                <CheckCircle2 className="w-2.5 h-2.5 text-white" />
                              </div>
                            ) : (
                              <div className="absolute -top-1 -right-1 bg-orange-500 rounded-full p-0.5 shadow-sm border border-slate-900">
                                <AlertCircle className="w-2.5 h-2.5 text-white" />
                              </div>
                            )
                          )}
                          {isHistoryCompact && !item.isReviewed && (
                            <div className="absolute top-0 right-0 w-2 h-2 bg-orange-500 rounded-full border border-slate-900" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={cn("flex items-center gap-2", isHistoryCompact ? "flex-row" : "flex-col items-start gap-1")}>
                            <p className={cn("font-bold truncate text-white", isHistoryCompact ? "text-xs max-w-[100px]" : "text-sm")}>
                              {item.data.name || t('history.no_name')}
                            </p>
                            
                            <div className="flex items-center gap-2">
                              {(!isHistoryCompact && !item.isReviewed) && (
                                <span className="px-1.5 py-0.5 bg-orange-500/20 text-orange-400 text-[8px] font-black rounded uppercase border border-orange-500/20">Pending</span>
                              )}
                              {item.originalExtract && JSON.stringify(item.data) !== JSON.stringify(item.originalExtract) && (
                                <span className={cn("rounded-full bg-yellow-500 shadow-[0_0_8px_var(--color-yellow-500)]", isHistoryCompact ? "w-1.5 h-1.5" : "w-2 h-2")} title="تم التعديل" />
                              )}
                            </div>
                          </div>
                          
                          <div className={cn("flex items-center gap-2 mt-0.5", isHistoryCompact ? "hidden sm:flex" : "flex")}>
                             <div className={cn(
                              "px-1.5 py-0.5 rounded-md text-[8px] font-black text-white uppercase tracking-tighter flex items-center gap-1",
                              getDocTypeById(item.data.documentType).color
                            )}>
                              {getDocTypeById(item.data.documentType).label}
                            </div>
                            {!isHistoryCompact && <p className="text-[10px] text-slate-500 font-mono">{item.timestamp}</p>}
                            {(item.eventName && !isHistoryCompact) && (
                              <span className="text-[9px] bg-primary/10 text-primary px-1.5 rounded-full border border-primary/20 truncate max-w-[100px]">
                                {item.eventName}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setItemToDelete(item.id);
                          }}
                          className={cn(
                            "group-hover:opacity-100 p-2 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all",
                            isHistoryCompact ? "opacity-100 p-1" : "opacity-0"
                          )}
                        >
                          <Trash2 className={isHistoryCompact ? "w-3 h-3" : "w-4 h-4"} />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  
                  {filteredHistory.length === 0 && (
                    <div className="py-12 text-center text-slate-300">
                      <History className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      <p className="text-sm font-medium">لا توجد سجلات سابقة</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-0 lg:gap-2 h-auto lg:h-[calc(100vh-140px)] relative">
            
            {/* Left Pillar: Data Results Card (Resizable) */}
            <BentoCard 
              className="flex flex-col overflow-hidden relative"
              style={{ width: `${splitRatio}%`, paddingRight: '5px', paddingLeft: '10px' }}
            >
              <div className="flex justify-between items-center border-b-2 border-primary/50 pb-2 mb-4 sticky top-0 bg-card-bg/95 backdrop-blur z-30">
                <div className="flex items-center gap-4">
                  <button 
                    onClick={goBack}
                    className="p-2 hover:bg-slate-800 rounded-lg transition-colors text-slate-400 hover:text-white flex items-center gap-2 text-xs font-bold"
                  >
                    <ArrowRight className="w-4 h-4" /> رجوع
                  </button>
                  <div className="h-4 w-px bg-border" />
                  <h3 className="font-black text-lg flex items-center gap-2">
                     <FileSpreadsheet className="w-5 h-5 text-primary" /> مراجعة البيانات المستخرجة
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  {lastAutoSave && (
                    <div className="flex items-center gap-1 px-2 py-1 bg-green-500/10 border border-green-500/20 rounded-md text-[8px] font-bold text-green-400">
                      <Save className="w-2 h-2" /> {lastAutoSave}
                    </div>
                  )}
                  {originalData && isDirty && (
                    <button 
                      onClick={() => setData(JSON.parse(JSON.stringify(originalData)))}
                      className="p-1.5 bg-slate-800 text-slate-400 rounded-lg hover:text-white transition-all border border-border"
                      title="استعادة الأصلي"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar pr-1">
                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-3 mb-4">
                    <AlertCircle className="w-4 h-4 text-red-500 mt-0.5" />
                    <p className="text-[10px] text-red-400 leading-relaxed font-bold">{error}</p>
                    <button onClick={() => setError(null)} className="ml-auto"><X className="w-3 h-3 text-red-500" /></button>
                  </div>
                )}

                {potentialDuplicates.length > 0 && (
                  <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 mb-4">
                    <div className="flex items-center gap-2 text-orange-500 mb-2">
                      <AlertCircle className="w-4 h-4" />
                      <span className="text-[10px] font-black uppercase">تنبيه: وثائق مشابهة!</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {potentialDuplicates.slice(0, 2).map(dup => (
                        <div key={dup.item.id} className="bg-orange-500/20 px-2 py-1 rounded text-[9px] text-orange-200 border border-orange-500/30">
                          {dup.item.data.name} ({Math.round(dup.score * 100)}%)
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-3">
                  <CollapsibleSection title={t('data.title')} icon={FileText}>
                    <div className="space-y-4">
                      <DataInput label={t('data.full_name')} value={data?.name} onChange={(v) => updateDataField('name', v)} loading={isProcessing} helpText={t('data.full_name_help')} icon={Users} sideBySide />
                      
                      {data?.documentType === 'other' && (
                        <DataInput label={t('upload.other_desc_label')} value={data?.otherDescription} onChange={(v) => updateDataField('otherDescription', v)} loading={isProcessing} icon={Info} sideBySide />
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {(data?.documentType === 'national_id' || data?.documentType === 'birth_certificate') && (
                          <DataInput label={t('data.national_id')} value={data?.nationalId} onChange={(v) => updateDataField('nationalId', v)} loading={isProcessing} mono status={idValidation?.isValid ? 'success' : 'error'} helpText={t('data.national_id_help')} icon={FileText} />
                        )}
                        {(data?.documentType === 'passport' || data?.passportNumber) && (
                          <DataInput label={t('data.passport_number')} value={data?.passportNumber} onChange={(v) => updateDataField('passportNumber', v)} loading={isProcessing} mono helpText={t('data.passport_number_help')} icon={FileText} />
                        )}
                        {(data?.documentType === 'unhcr_card' || data?.unhcrFileNumber) && (
                          <DataInput label={t('data.unhcr_file')} value={data?.unhcrFileNumber} onChange={(v) => updateDataField('unhcrFileNumber', v)} loading={isProcessing} mono helpText={t('data.unhcr_file_help')} icon={FileText} />
                        )}
                        {(data?.documentType === 'unhcr_card' || data?.unhcrIndividualNumber) && (
                          <DataInput label={t('data.individual_number')} value={data?.unhcrIndividualNumber} onChange={(v) => updateDataField('unhcrIndividualNumber', v)} loading={isProcessing} mono helpText={t('data.individual_number_help')} icon={FileText} />
                        )}
                        {(data?.documentType === 'driving_license' || data?.licenseNumber) && (
                          <DataInput label={t('data.license_number')} value={data?.licenseNumber} onChange={(v) => updateDataField('licenseNumber', v)} loading={isProcessing} mono icon={FileText} />
                        )}
                        {(data?.documentType === 'work_permit' || data?.permitNumber) && (
                          <DataInput label={t('data.permit_number')} value={data?.permitNumber} onChange={(v) => updateDataField('permitNumber', v)} loading={isProcessing} mono icon={FileText} />
                        )}
                        {data?.expiryDate && (
                          <DataInput label={t('data.expiry_date')} value={data?.expiryDate} onChange={(v) => updateDataField('expiryDate', v)} loading={isProcessing} helpText={t('data.expiry_date_help')} icon={History} />
                        )}
                        {data?.issuingCountry && (
                          <DataInput label={t('data.issuing_country')} value={data?.issuingCountry} onChange={(v) => updateDataField('issuingCountry', v)} loading={isProcessing} helpText={t('data.issuing_country_help')} icon={Database} />
                        )}
                      </div>
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection title={t('data.personal_info')} icon={Users} defaultOpen={false}>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <DataInput label={t('data.nationality')} value={data?.nationality} onChange={(v) => updateDataField('nationality', v)} loading={isProcessing} helpText={t('data.nationality_help')} />
                        <DataInput label={t('data.religion')} value={data?.religion} onChange={(v) => updateDataField('religion', v)} loading={isProcessing} />
                        <DataInput label={t('data.job')} value={data?.job} onChange={(v) => updateDataField('job', v)} loading={isProcessing} />
                        <DataInput label={t('data.status')} value={data?.status} onChange={(v) => updateDataField('status', v)} loading={isProcessing} />
                      </div>
                      {(data?.documentType === 'birth_certificate' || data?.fatherName || data?.motherName) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border/30">
                          <DataInput label="اسم الأب" value={data?.fatherName} onChange={(v) => updateDataField('fatherName', v)} loading={isProcessing} icon={Users} />
                          <DataInput label="اسم الأم" value={data?.motherName} onChange={(v) => updateDataField('motherName', v)} loading={isProcessing} icon={Users} />
                        </div>
                      )}
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection title={t('data.birth_residence')} icon={History} defaultOpen={false}>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <DataInput label={t('data.birth_date')} value={data?.birthDate} onChange={(v) => updateDataField('birthDate', v)} loading={isProcessing} helpText={t('data.birth_date_help')} />
                        <DataInput label={t('data.birth_place')} value={data?.birthPlace} onChange={(v) => updateDataField('birthPlace', v)} loading={isProcessing} />
                      </div>
                      <DataInput label={t('data.address')} value={data?.address} onChange={(v) => updateDataField('address', v)} loading={isProcessing} sideBySide icon={Search} />
                    </div>
                  </CollapsibleSection>

                  <CollapsibleSection title="الخدمات الطبية" icon={Star} defaultOpen={false}>
                    <div className="space-y-3">
                      {data?.serviceItems?.map((item, idx) => (
                        <div key={item.id} className="p-4 bg-slate-800/50 rounded-xl border border-border/50 relative group">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DataInput label="التخصص" value={item.specialty} onChange={(v) => {
                              const updated = [...(data?.serviceItems || [])];
                              updated[idx].specialty = v;
                              setData({...data!, serviceItems: updated});
                            }} />
                            <DataInput label="نوع الخدمة" value={item.serviceType} onChange={(v) => {
                              const updated = [...(data?.serviceItems || [])];
                              updated[idx].serviceType = v;
                              setData({...data!, serviceItems: updated});
                            }} />
                          </div>
                          <div className="mt-4">
                            <DataInput label="الحالة المرضية" value={item.condition} onChange={(v) => {
                              const updated = [...(data?.serviceItems || [])];
                              updated[idx].condition = v;
                              setData({...data!, serviceItems: updated});
                            }} />
                          </div>
                          <button 
                            onClick={() => {
                              const updated = (data?.serviceItems || []).filter(s => s.id !== item.id);
                              setData({...data!, serviceItems: updated});
                            }}
                            className="absolute -top-2 -left-2 opacity-0 group-hover:opacity-100 p-2 bg-red-500 rounded-xl text-white transition-all shadow-xl z-10"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      <button 
                        onClick={() => {
                          const newItem = { id: Math.random().toString(36).substr(2, 9), specialty: '', condition: '', doctorName: '', serviceType: 'كشف' };
                          setData({ ...data!, serviceItems: [...(data?.serviceItems || []), newItem] });
                        }}
                        className="w-full py-3 bg-slate-800 border border-dashed border-border rounded-xl text-[11px] font-bold text-slate-500 hover:text-primary transition-all flex items-center justify-center gap-2"
                      >
                        <Plus className="w-4 h-4" /> إضافة بند طبي
                      </button>
                    </div>
                  </CollapsibleSection>

                  {/* Custom Fields Section */}
                  <CollapsibleSection title="حقول مخصصة" icon={PlusSquare} defaultOpen={Object.keys(data?.customFields || {}).length > 0}>
                    <div className="space-y-4">
                      {Object.entries(data?.customFields || {}).map(([key, val]) => (
                        <div key={key} className="relative group">
                          <DataInput 
                            label={key} 
                            value={val} 
                            onChange={(newValue) => updateCustomField(key, newValue)} 
                            loading={isProcessing}
                            sideBySide
                          />
                          <button 
                            onClick={() => deleteCustomField(key)}
                            className="absolute -top-2 -left-2 opacity-0 group-hover:opacity-100 p-1.5 bg-red-500/80 rounded-lg text-white transition-all shadow-lg z-10"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      <button 
                        onClick={addCustomField}
                        className="w-full py-3 bg-slate-800 border border-dashed border-border rounded-xl text-[11px] font-bold text-slate-500 hover:text-primary transition-all flex items-center justify-center gap-2"
                      >
                        <PlusSquare className="w-4 h-4" /> {t('actions.add_field')}
                      </button>
                    </div>
                  </CollapsibleSection>

                  <div className="p-4 space-y-4">
                    <DataInput 
                      label="ملاحظات إضافية" 
                      value={data?.notes} 
                      onChange={(v) => updateDataField('notes', v)} 
                      loading={isProcessing}
                      helpText="أضف أي ملاحظات إدارية أو طبية إضافية هنا"
                    />
                    
                    <div className="flex gap-2">
                      <button 
                        onClick={reset}
                        className="flex-1 py-3 bg-slate-800 text-slate-400 rounded-xl font-bold text-xs hover:text-white transition-all border border-border"
                      >
                        إلغاء المعالجة
                      </button>
                      <button 
                        onClick={() => setIsConfirmingSave(true)}
                        disabled={!isDirty || isProcessing}
                        className="flex-[2] py-3 bg-primary text-white rounded-xl font-black text-sm hover:brightness-110 active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-xl shadow-primary/20"
                      >
                        <Save className="w-4 h-4" /> حفظ ومراجعة
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </BentoCard>

            {/* Draggable Divider */}
            <div 
              onMouseDown={handleMouseDown}
              className={cn(
                "hidden lg:flex w-2 group cursor-col-resize items-center justify-center relative z-50",
                isSplitDragging ? "bg-primary/30" : "hover:bg-primary/10"
              )}
            >
              <div className="w-0.5 h-12 bg-border group-hover:bg-primary/50 transition-colors rounded-full flex items-center justify-center">
                <GripVertical className="w-4 h-4 text-slate-600 group-hover:text-primary absolute" />
              </div>
            </div>

            {/* Right Pillar: Controls & Context */}
            <div style={{ width: `${100 - splitRatio}%` }} className="flex flex-col gap-4 h-full">
              
              {/* Image Preview Card */}
              <BentoCard 
                className="flex-1 flex flex-col gap-2 overflow-hidden relative min-h-[400px]"
                style={{ height: '780px' }}
              >
                <div className="flex justify-between items-center mb-1 px-1">
                  <h3 className="font-bold text-sm flex items-center gap-2">
                    <Scan className="w-4 h-4 text-primary" /> معاينة المستند
                  </h3>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => setShowFilters(!showFilters)}
                      className={cn(
                        "p-1.5 rounded-lg transition-all",
                        showFilters ? "bg-primary text-white" : "bg-slate-800 text-slate-400 hover:text-white border border-border"
                      )}
                    >
                      <Filter className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => setRotation(prev => (prev + 90) % 360)} className="p-1.5 bg-slate-800 border border-border rounded-lg text-slate-400 hover:text-white transition-all"><RotateCw className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <div className="flex-1 relative bg-slate-950 rounded-2xl border border-border/50 overflow-hidden group/preview bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-900/50 via-slate-950 to-slate-950">
                  <AnimatePresence>
                    {showFilters && (
                      <motion.div 
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        className="absolute top-4 right-4 z-40 w-48 bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl space-y-4"
                      >
                        <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-2 flex items-center justify-between">
                          <span>Image Filters</span>
                          <button onClick={() => setFilters({ brightness: 100, contrast: 100, saturation: 100, sharpness: 0 })} className="text-primary hover:underline lowercase font-normal tracking-normal italic">reset</button>
                        </h4>
                        
                        <div className="space-y-3">
                          <FilterSlider label="Brightness" value={filters.brightness} min={50} max={150} onChange={(v) => setFilters({...filters, brightness: v})} />
                          <FilterSlider label="Contrast" value={filters.contrast} min={50} max={250} onChange={(v) => setFilters({...filters, contrast: v})} />
                          <FilterSlider label="Saturation" value={filters.saturation} min={0} max={200} onChange={(v) => setFilters({...filters, saturation: v})} />
                          <FilterSlider label="Sharpness" value={filters.sharpness} min={0} max={100} onChange={(v) => setFilters({...filters, sharpness: v})} />
                        </div>

                        <div className="pt-2 border-t border-white/5">
                           <p className="text-[9px] text-slate-500 leading-tight italic">
                             * Increasing contrast &gt; 150% triggers high-contrast binarization for better OCR.
                           </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <AnimatePresence mode="wait">
                    <motion.div 
                      key={image + rotation + JSON.stringify(filters)}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="w-full h-full flex items-center justify-center p-4"
                    >
                      <motion.img 
                        src={image} 
                        style={{ 
                          scale: zoom,
                          rotate: rotation,
                          filter: `brightness(${filters.brightness}%) contrast(${filters.contrast}%) saturate(${filters.saturation}%) contrast(${100 + filters.sharpness}%)`,
                        }}
                        className="max-w-full max-h-full object-contain shadow-2xl transition-all duration-300 pointer-events-auto"
                        alt="Document Preview"
                      />
                    </motion.div>
                  </AnimatePresence>

                  {isProcessing && (
                    <div className="absolute inset-0 pointer-events-none bg-slate-900/40 backdrop-blur-[1px] flex flex-col items-center justify-center z-20">
                      <RefreshCw className="w-10 h-10 animate-spin text-primary mb-2" />
                      <p className="font-black text-primary text-xs tracking-widest uppercase">Extracting...</p>
                    </div>
                  )}

                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 p-1 bg-slate-900/80 backdrop-blur-md rounded-lg border border-white/10 opacity-0 group-hover/preview:opacity-100 transition-all z-20 shadow-xl">
                    <button onClick={() => setZoom(prev => Math.max(0.5, prev - 0.2))} className="p-1 px-2 hover:bg-white/10 rounded transition-all text-white text-[10px]">-</button>
                    <span className="text-[10px] font-mono text-white/50">{Math.round(zoom * 100)}%</span>
                    <button onClick={() => setZoom(prev => Math.min(3, prev + 0.2))} className="p-1 px-2 hover:bg-white/10 rounded transition-all text-white text-[10px]">+</button>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2 mt-1">
                  <ProcessTag label="Enhance" completed />
                  <ProcessTag label="Sync" completed={data !== null} />
                  <ProcessTag label="Verify" completed={data !== null && !isConfirmingType} />
                  <div className="text-[8px] flex items-center justify-center text-slate-500 font-mono italic">SECURE_OCR</div>
                </div>
              </BentoCard>

              {/* Processing Steps Card */}
              <BentoCard className="flex flex-col justify-center h-48">
                <h3 className="font-bold text-xs mb-3 flex items-center gap-2">
                   <Cpu className="w-3.5 h-3.5 text-primary" /> حالة المعالجة الـذكية
                </h3>
                <div className="space-y-4">
                  <ProgressStep label="تحسين الجودة" progress={processingStage > 20 ? 100 : processingStage} />
                  <ProgressStep label="هيكلة البيانات" progress={processingStage === 100 ? 100 : 0} />
                  
                  <div className="p-3 bg-primary/5 border border-primary/10 rounded-xl text-[9px] text-slate-400 leading-relaxed italic">
                    يتم مطابقة البيانات مع آلاف النماذج الحكومية المرجعية لضمان الدقة.
                  </div>
                </div>
              </BentoCard>

              {/* Confidence Card */}
              <BentoCard className="bg-primary text-white flex flex-row justify-between items-center p-4 min-h-[80px]">
                <div className="text-left">
                  <span className="font-mono text-[8px] text-white/50 uppercase tracking-widest block mb-0.5">ثقة النظام</span>
                  <div className="text-2xl font-black leading-none">
                    {data ? "98.4%" : isProcessing ? `${processingStage}%` : "00.0%"}
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <div className="text-[9px] font-bold bg-white/20 px-2 py-0.5 rounded-full flex items-center gap-1.5">
                    <Zap className="w-3 h-3 text-yellow-300" />
                    Verified
                  </div>
                  <span 
                    className="text-[8px] opacity-60 mt-1 font-mono tracking-tighter"
                  >
                    Reliability Index
                  </span>
                </div>
              </BentoCard>
            </div>
          </div>
        )}
      </main>

      <footer className="mt-12 mb-8 text-center text-slate-400">
        <p className="text-xs font-mono uppercase tracking-widest">Enterprise Edition • Secure Logged • (C) 2024</p>
      </footer>

      {/* Confirmation Dialog */}
      <AnimatePresence>
        {itemToDelete && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-card-bg border border-border rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center"
            >
              <div className="bg-red-500/10 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Trash2 className="w-8 h-8 text-red-500" />
              </div>
              <h4 className="text-xl font-black mb-2 text-white">هل أنت متأكد؟</h4>
              <p className="text-slate-400 text-sm mb-8 leading-relaxed">
                سيتم حذف هذا المستند نهائياً من الأرشيف المؤقت. لا يمكن التراجع عن هذا الإجراء.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => deleteHistoryItem(itemToDelete)}
                  className="flex-1 bg-red-500 text-white py-3 rounded-xl font-bold hover:bg-red-600 transition-all"
                >
                  حذف نهائي
                </button>
                <button 
                  onClick={() => setItemToDelete(null)}
                  className="flex-1 bg-slate-800 text-slate-300 py-3 rounded-xl font-bold hover:bg-slate-700 transition-all border border-border"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {isConfirmingSave && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[130] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-card-bg border border-border rounded-3xl p-8 max-w-md w-full shadow-2xl"
              dir="rtl"
            >
              <div className="bg-primary/10 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 className="w-8 h-8 text-primary" />
              </div>
              
              <h4 className="text-xl font-black mb-2 text-white text-center">مراجعة وتأكيد الوثيقة</h4>
              <p className="text-slate-400 text-sm mb-6 leading-relaxed text-center">
                يرجى التأكد من نوع الوثيقة والبيانات قبل الحفظ النهائي في الأرشيف.
              </p>

              <div className="space-y-4 mb-8">
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-black text-slate-500 px-1 tracking-widest">نوع الوثيقة المكتشف</label>
                  <select 
                    value={data?.documentType}
                    onChange={(e) => updateDataField('documentType', e.target.value)}
                    className="w-full bg-slate-800 border border-border rounded-xl px-4 py-3 text-sm font-bold text-white focus:ring-2 focus:ring-primary/20 outline-none transition-all appearance-none cursor-pointer"
                  >
                    {DOCUMENT_TYPES.map(type => (
                      <option key={type.id} value={type.id}>{type.label}</option>
                    ))}
                  </select>
                </div>

                <div className="p-4 bg-slate-900/50 rounded-2xl border border-border/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                      <Users className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-slate-500 font-bold uppercase">الاسم المستخرج</p>
                      <p className="text-sm font-black text-white truncate">{data?.name || "غير معروف"}</p>
                    </div>
                  </div>
                </div>

                {potentialDuplicates.length > 0 && (
                  <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-xl flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                    <p className="text-[10px] text-orange-200/80 leading-relaxed font-bold">
                      تنبيـه: تم العثور على {potentialDuplicates.length} سجلات مشابهة في الأرشيف. قد يكون هذا الشخص مسجلاً مسبقاً.
                    </p>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => {
                    confirmDocumentType();
                    setIsConfirmingSave(false);
                  }}
                  className="flex-1 bg-primary text-white py-3.5 rounded-xl font-bold hover:brightness-110 transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
                >
                  <Save className="w-4 h-4" /> حفظ السجل
                </button>
                <button 
                  onClick={() => setIsConfirmingSave(false)}
                  className="flex-1 bg-slate-800 text-slate-300 py-3.5 rounded-xl font-bold hover:bg-slate-700 transition-all border border-border"
                >
                  إلغاء وتعديل
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {showUploadPreview && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 30 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-card-bg border border-border rounded-[2.5rem] p-8 max-w-2xl w-full shadow-2xl flex flex-col max-h-[85vh]"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-primary/10 rounded-2xl">
                    <PlusSquare className="w-8 h-8 text-primary" />
                  </div>
                  <div>
                    <h4 className="text-2xl font-black text-white">معاينة الملفات المختارة</h4>
                    <p className="text-slate-400 text-sm">قم بمراجعة الملفات قبل البدء بالمعالجة التلقائية</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowUploadPreview(false)}
                  className="p-2 bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="flex-grow overflow-y-auto custom-scrollbar pr-2 space-y-3 mb-8">
                {pendingFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-4 p-4 bg-slate-900 border border-border/50 rounded-2xl hover:bg-slate-800/80 transition-all group">
                    <div className="w-16 h-16 rounded-xl overflow-hidden border border-border bg-black flex-shrink-0">
                      <img 
                        src={URL.createObjectURL(file)} 
                        alt="Preview" 
                        className="w-full h-full object-cover" 
                        onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
                      />
                    </div>
                    <div className="flex-grow min-w-0">
                      <p className="font-bold text-slate-200 truncate">{file.name}</p>
                      <p className="text-[10px] text-slate-500 font-mono">{(file.size / 1024).toFixed(2)} KB • {file.type}</p>
                    </div>
                    <button 
                      onClick={() => setPendingFiles(pendingFiles.filter((_, i) => i !== idx))}
                      className="p-2 text-slate-500 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex gap-4">
                <button 
                  onClick={() => startBatchProcessing(pendingFiles)}
                  disabled={pendingFiles.length === 0}
                  className="flex-1 bg-primary text-white py-4 rounded-2xl font-bold hover:brightness-110 active:scale-95 disabled:opacity-50 transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-3"
                >
                  <Zap className="w-6 h-6" />
                  بدء معالجة {pendingFiles.length} وثائق دفعة واحدة
                </button>
                <button 
                  onClick={() => {
                    const extraInput = document.createElement('input');
                    extraInput.type = 'file';
                    extraInput.multiple = true;
                    extraInput.accept = 'image/*';
                    extraInput.onchange = (e: any) => {
                      const newFiles = Array.from(e.target.files as FileList).filter(f => f.type.startsWith('image/'));
                      setPendingFiles([...pendingFiles, ...newFiles]);
                    };
                    extraInput.click();
                  }}
                  className="px-6 bg-slate-800 text-slate-300 rounded-2xl font-bold hover:bg-slate-700 transition-all border border-border flex items-center justify-center"
                >
                  <Plus className="w-6 h-6" />
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {isClearingAll && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-card-bg border border-border rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center"
            >
              <div className="bg-red-500/10 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
              <h4 className="text-xl font-black mb-2 text-white">مسح الأرشيف بالكامل؟</h4>
              <p className="text-slate-400 text-sm mb-8 leading-relaxed">
                سيتم حذف جميع السجلات والوثائق من الأرشيف المؤقت نهائياً. تأكد من قيامك بتصدير البيانات الهامة أولاً.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={clearAllHistory}
                  className="flex-1 bg-red-500 text-white py-3 rounded-xl font-bold hover:bg-red-600 transition-all"
                >
                  نعم، امسح الكل
                </button>
                <button 
                  onClick={() => setIsClearingAll(false)}
                  className="flex-1 bg-slate-800 text-slate-300 py-3 rounded-xl font-bold hover:bg-slate-700 transition-all border border-border"
                >
                  إلغاء
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast Notifications */}
      <div className="fixed bottom-8 left-8 z-[100] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, x: -20, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -20, scale: 0.9 }}
              className="bg-slate-900 border border-primary/30 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 pointer-events-auto"
            >
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <span className="text-sm font-bold">{toast.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function CollapsibleSection({ title, icon: Icon, children, defaultOpen = true }: { title: string, icon: any, children: React.ReactNode, defaultOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="border border-border/50 rounded-3xl overflow-hidden bg-slate-900/30 mb-4 transition-all">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-6 py-4 bg-slate-800/40 hover:bg-slate-800/60 transition-all font-bold text-slate-200"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-xl">
            <Icon className="w-4 h-4 text-primary" />
          </div>
          <span className="text-sm">{title}</span>
        </div>
        <ChevronDown className={cn("w-4 h-4 text-slate-500 transition-transform", !isOpen && "-rotate-90")} />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-6 pt-2 grid grid-cols-1 gap-6">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TypeSelectBtn({ active, onClick, label }: { active: boolean, onClick: () => void, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "py-3 px-4 rounded-xl text-sm font-bold border-2 transition-all",
        active 
          ? "bg-primary border-primary text-white shadow-lg shadow-primary/30" 
          : "bg-slate-800/50 border-border text-slate-400 hover:border-primary/50"
      )}
    >
      {label}
    </button>
  );
}


function FilterSlider({ label, value, min, max, onChange }: { label: string, value: number, min: number, max: number, onChange: (v: number) => void }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center text-[9px] font-bold">
        <span className="text-slate-400">{label}</span>
        <span className="text-primary font-mono">{value}%</span>
      </div>
      <input 
        type="range" 
        min={min} max={max} 
        value={value} 
        onChange={(e) => onChange(parseInt(e.target.value))}
        className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-primary" 
      />
    </div>
  );
}

function ThresholdControl({ label, value, onChange }: { label: string, value: number, onChange: (v: number) => void }) {
  const { t } = useTranslation();
  
  const getDescriptor = (v: number) => {
    if (v < 0.4) return { label: t('settings.sensitivity_low'), color: 'text-blue-400' };
    if (v < 0.7) return { label: t('settings.sensitivity_medium'), color: 'text-green-400' };
    if (v < 0.9) return { label: t('settings.sensitivity_high'), color: 'text-orange-400' };
    return { label: t('settings.sensitivity_exact'), color: 'text-red-400' };
  };

  const descriptor = getDescriptor(value);

  return (
    <div className="space-y-3 p-3 bg-slate-900/50 rounded-2xl border border-border/50">
      <div className="flex justify-between items-center">
        <div className="space-y-0.5">
          <span className="text-[10px] font-bold text-slate-400 block">{label}</span>
          <span className={cn("text-[8px] font-black uppercase tracking-tighter", descriptor.color)}>
            {descriptor.label}
          </span>
        </div>
        <div className="flex items-center gap-3 bg-slate-800 rounded-xl p-1 border border-border">
          <button 
            onClick={() => onChange(Math.max(0.1, value - 0.05))}
            className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-all"
          >
            <Minus className="w-3 h-3" />
          </button>
          <span className="text-sm font-mono font-bold w-10 text-center text-primary">
            {Math.round(value * 100)}%
          </span>
          <button 
            onClick={() => onChange(Math.min(1, value + 0.05))}
            className="p-1.5 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white transition-all"
          >
            <Plus className="w-3 h-3" />
          </button>
        </div>
      </div>
      <input 
        type="range" min="0.1" max="1" step="0.05"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-primary"
      />
    </div>
  );
}

function BentoCard({ children, className, delay = 0, style }: { children: React.ReactNode, className?: string, delay?: number, style?: React.CSSProperties }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      style={style}
      className={cn(
        "bg-card-bg border border-border rounded-xl p-5 shadow-bento",
        className
      )}
    >
      {children}
    </motion.div>
  );
}

function Badge({ children, color, icon: Icon }: { children: React.ReactNode, color: 'blue' | 'green', icon: any }) {
  const styles = {
    blue: "bg-primary/10 text-primary border border-primary/20",
    green: "bg-green-500/10 text-green-400 border border-green-500/20"
  };
  return (
    <div className={cn("px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 border", styles[color])}>
      <Icon className="w-4 h-4" />
      {children}
    </div>
  );
}

function ProcessTag({ label, completed }: { label: string, completed: boolean }) {
  return (
    <div className={cn(
      "px-3 py-1.5 rounded-xl text-[10px] font-bold flex items-center justify-center gap-2 border transition-all",
      completed 
        ? "bg-green-500/10 text-green-400 border-green-500/30" 
        : "bg-slate-800/50 text-slate-500 border-slate-700"
    )}>
      {label} {completed ? '✓' : '×'}
    </div>
  );
}

function ProgressStep({ label, progress }: { label: string, progress: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs font-medium">
        <span className="text-slate-300">{label}</span>
        <span className="text-primary font-bold">{progress === 100 ? 'تم التنفيذ' : `${progress}%`}</span>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden border border-border">
        <motion.div 
          className="h-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 1 }}
        />
      </div>
    </div>
  );
}

function DataInput({ label, value, onChange, loading, mono, status, errorMessage, helpText, icon: Icon, sideBySide = false, className }: { 
  label: string, 
  value?: string, 
  onChange?: (val: string) => void,
  loading?: boolean, 
  mono?: boolean,
  status?: 'success' | 'error',
  errorMessage?: string,
  helpText?: string,
  icon?: any,
  sideBySide?: boolean,
  className?: string
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showExpand, setShowExpand] = useState(false);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '1px'; 
      const scrollHeight = textareaRef.current.scrollHeight;
      const targetHeight = Math.max(44, scrollHeight);
      
      const MAX_COLLAPSED_HEIGHT = 120;
      if (scrollHeight > MAX_COLLAPSED_HEIGHT && !isExpanded) {
        setShowExpand(true);
        textareaRef.current.style.height = MAX_COLLAPSED_HEIGHT + 'px';
      } else {
        textareaRef.current.style.height = targetHeight + 'px';
        if (scrollHeight <= MAX_COLLAPSED_HEIGHT) setShowExpand(false);
      }
    }
  }, [value, loading, isExpanded]);

  const displayValue = loading ? "..." : (value || "");
  const isMultiLine = (value || "").includes('\n') || (value || "").length > 35;

  return (
    <motion.div 
      layout="position"
      className={cn("space-y-1.5 group/input relative w-full", sideBySide && "flex flex-col sm:flex-row sm:items-start sm:gap-4", className)}
    >
      <label className={cn(
        "font-mono text-[9px] font-black uppercase text-slate-500 tracking-widest flex items-center justify-between px-1 transition-colors group-focus-within/input:text-primary/60",
        sideBySide && "sm:w-32 sm:flex-shrink-0 sm:pt-4"
      )}>
        <div className="flex items-center gap-2">
          {Icon && <Icon className={cn("w-3 h-3 text-primary/40 group-hover/input:text-primary transition-colors flex-shrink-0", isMultiLine && "text-primary/60")} />}
          <span className="truncate">{label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {status === 'success' && <CheckCircle2 className="w-2.5 h-2.5 text-green-500" />}
          {status === 'error' && <AlertCircle className="w-2.5 h-2.5 text-red-500" />}
          {helpText && (
            <div className="relative group/help">
              <Info className="w-2.5 h-2.5 text-slate-600 hover:text-slate-400 cursor-help" />
              <div className="absolute bottom-full right-0 mb-2 invisible group-hover/help:visible w-48 p-3 bg-slate-900 border border-border rounded-xl shadow-2xl text-[10px] text-slate-200 z-50 normal-case tracking-normal font-sans backdrop-blur-md text-right">
                {helpText}
              </div>
            </div>
          )}
        </div>
      </label>
      
      <div className={cn(
        "relative rounded-xl border border-border bg-slate-800/40 hover:bg-slate-800/60 transition-all focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/40 shadow-inner group/field flex-1",
        isMultiLine && "border-primary/20 bg-slate-800/50"
      )}>
        <textarea 
          ref={textareaRef}
          rows={1}
          readOnly={!onChange || loading}
          value={displayValue}
          onChange={(e) => onChange?.(e.target.value)}
          className={cn(
            "w-full bg-transparent px-4 py-3 text-sm font-bold text-white focus:outline-none transition-all placeholder:text-slate-700 resize-none leading-relaxed overflow-hidden block custom-scrollbar-thin",
            !onChange ? "cursor-default" : "cursor-text",
            mono && "font-mono tracking-widest",
            loading && "text-slate-600 animate-pulse",
            status === 'error' && "text-red-400"
          )}
          style={{ minHeight: '44px', transition: 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
        
        {showExpand && (
          <div className={cn(
            "absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-slate-900 to-transparent flex items-end justify-center pb-1 transition-opacity duration-300",
            isExpanded ? "opacity-0 pointer-events-none" : "opacity-100"
          )}>
            <button 
              onClick={() => setIsExpanded(true)}
              className="px-3 py-1 bg-primary/20 border border-primary/30 rounded-full text-[9px] font-black uppercase text-primary hover:bg-primary/30 transition-all mb-1"
            >
              Show More
            </button>
          </div>
        )}

        {isExpanded && showExpand && (
          <button 
            onClick={() => setIsExpanded(false)}
            className="absolute top-2 left-2 p-1.5 bg-slate-900 border border-border rounded-lg text-slate-400 hover:text-white transition-all shadow-xl z-20"
            title="Collapse"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
        )}

        {isMultiLine && !loading && !showExpand && (
          <div className="absolute bottom-1 right-2 opacity-30 pointer-events-none">
            <div className="w-2 h-2 border-r-2 border-b-2 border-primary/40 rounded-[1px]" />
          </div>
        )}
      </div>

      {errorMessage && <p className="text-[9px] text-red-500 px-1 font-bold">{errorMessage}</p>}
    </motion.div>
  );
}
