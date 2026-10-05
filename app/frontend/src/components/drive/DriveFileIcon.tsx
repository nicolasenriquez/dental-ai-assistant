import { File, FileCode2, FileText } from 'lucide-react';

interface DriveFileIconProps {
  mimeType: string;
  name: string;
  kind?: string;
  size?: number;
}

export function DriveFileIcon({ mimeType, name, kind, size = 18 }: DriveFileIconProps) {
  const lowerName = name.toLowerCase();
  const lowerMimeType = mimeType.toLowerCase();
  const isCodeLike =
    kind === 'markdown' ||
    kind === 'text' ||
    lowerMimeType === 'text/markdown' ||
    lowerMimeType === 'text/plain' ||
    lowerName.endsWith('.md') ||
    lowerName.endsWith('.txt');
  const isDocument =
    kind === 'docx' ||
    kind === 'google-doc' ||
    kind === 'pdf' ||
    lowerMimeType.includes('pdf') ||
    lowerMimeType.includes('word') ||
    lowerMimeType.includes('google-apps.document');
  const Icon = isCodeLike ? FileCode2 : isDocument ? FileText : File;

  return <Icon aria-hidden="true" size={size} strokeWidth={1.8} />;
}
