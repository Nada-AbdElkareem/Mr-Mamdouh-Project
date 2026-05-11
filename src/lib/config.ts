import { FileText, CreditCard, BookOpen, Users, Cpu, Briefcase } from 'lucide-react';

export const DOCUMENT_TYPES = [
  {
    id: 'national_id',
    label: 'رقم قومي',
    description: 'بطاقة الرقم القومي المصرية',
    icon: CreditCard,
    color: 'bg-primary'
  },
  {
    id: 'birth_certificate',
    label: 'شهادة ميلاد',
    description: 'شهادة الميلاد المميكنة',
    icon: FileText,
    color: 'bg-blue-400'
  },
  {
    id: 'passport',
    label: 'جواز سفر',
    description: 'جواز السفر الدولي',
    icon: BookOpen,
    color: 'bg-green-400'
  },
  {
    id: 'unhcr_card',
    label: 'مفوضية',
    description: 'كارت مفوضية اللاجئين',
    icon: Users,
    color: 'bg-yellow-400'
  },
  {
    id: 'driving_license',
    label: 'رخصة قيادة',
    description: 'رخصة قيادة المركبات',
    icon: Cpu,
    color: 'bg-orange-400'
  },
  {
    id: 'work_permit',
    label: 'تصريح عمل',
    description: 'تصريح العمل لغير المصريين',
    icon: Briefcase,
    color: 'bg-purple-400'
  },
  {
    id: 'other',
    label: 'أخرى',
    description: 'وثائق ومستندات متنوعة',
    icon: FileText,
    color: 'bg-slate-500'
  }
] as const;

export type DocumentTypeId = typeof DOCUMENT_TYPES[number]['id'];

export const getDocTypeById = (id: string) => 
  DOCUMENT_TYPES.find(t => t.id === id) || DOCUMENT_TYPES[DOCUMENT_TYPES.length - 1];
