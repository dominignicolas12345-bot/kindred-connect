import jsPDF from 'jspdf';
import defaultLogoImg from '@/assets/logo-institucional.png';

interface ReceiptData {
  receiptNumber: string;
  memberName: string;
  memberDegree?: string;
  concept: string;
  totalAmount: number;
  amountPaid: number;
  paymentDate: string;
  institutionName: string;
  logoUrl?: string | null;
  /** For extraordinary fees with partial payment */
  remainingBalance?: number;
  /** Extra details lines */
  details?: string[];
}

async function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export async function generatePaymentReceipt(data: ReceiptData): Promise<jsPDF> {
  const doc = new jsPDF({ format: [148, 210] }); // A5 size
  const pageWidth = 148;
  let y = 15;

  // Logo
  const logoSrc = data.logoUrl || defaultLogoImg;
  const logoImg = await loadImage(logoSrc);
  if (!logoImg && data.logoUrl) {
    const fallback = await loadImage(defaultLogoImg);
    if (fallback) {
      const r = Math.min(20 / fallback.width, 15 / fallback.height);
      doc.addImage(fallback, 'PNG', 10, 8, fallback.width * r, fallback.height * r);
    }
  } else if (logoImg) {
    const r = Math.min(20 / logoImg.width, 15 / logoImg.height);
    doc.addImage(logoImg, 'PNG', 10, 8, logoImg.width * r, logoImg.height * r);
  }

  // Header
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(data.institutionName, pageWidth / 2, y, { align: 'center' });
  y += 7;
  doc.setFontSize(14);
  doc.text('RECIBO DE PAGO', pageWidth / 2, y, { align: 'center' });
  y += 6;

  // Receipt number and date
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`No. ${data.receiptNumber}`, pageWidth - 12, 10, { align: 'right' });
  doc.text(`Fecha: ${formatDate(data.paymentDate)}`, pageWidth - 12, 14, { align: 'right' });

  // Separator
  doc.setLineWidth(0.5);
  doc.line(10, y, pageWidth - 10, y);
  y += 8;

  // Member info
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Recibido de:', 12, y);
  doc.setFont('helvetica', 'normal');
  doc.text(data.memberName, 45, y);
  y += 6;

  if (data.memberDegree) {
    doc.setFont('helvetica', 'bold');
    doc.text('Grado:', 12, y);
    doc.setFont('helvetica', 'normal');
    doc.text(data.memberDegree, 45, y);
    y += 6;
  }

  // Concept
  doc.setFont('helvetica', 'bold');
  doc.text('Concepto:', 12, y);
  doc.setFont('helvetica', 'normal');
  const conceptLines = doc.splitTextToSize(data.concept, pageWidth - 57);
  doc.text(conceptLines, 45, y);
  y += conceptLines.length * 5 + 4;

  // Details
  if (data.details && data.details.length > 0) {
    doc.setFontSize(9);
    for (const detail of data.details) {
      doc.text(`• ${detail}`, 14, y);
      y += 5;
    }
    y += 2;
  }

  // Separator
  doc.setLineWidth(0.3);
  doc.line(10, y, pageWidth - 10, y);
  y += 7;

  // Amounts box
  doc.setFontSize(10);
  const amountBoxY = y;
  doc.setDrawColor(100);
  doc.setLineWidth(0.3);
  doc.roundedRect(10, amountBoxY - 3, pageWidth - 20, data.remainingBalance !== undefined && data.remainingBalance > 0 ? 28 : 20, 2, 2);

  doc.setFont('helvetica', 'bold');
  doc.text('Valor total:', 14, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`$${data.totalAmount.toFixed(2)}`, pageWidth - 14, y, { align: 'right' });
  y += 6;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Monto pagado:', 14, y);
  doc.text(`$${data.amountPaid.toFixed(2)}`, pageWidth - 14, y, { align: 'right' });
  y += 6;

  if (data.remainingBalance !== undefined && data.remainingBalance > 0) {
    doc.setFontSize(10);
    doc.setTextColor(200, 0, 0);
    doc.text('Saldo pendiente:', 14, y);
    doc.text(`$${data.remainingBalance.toFixed(2)}`, pageWidth - 14, y, { align: 'right' });
    doc.setTextColor(0, 0, 0);
    y += 6;
  }

  y += 8;

  // Signature line
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setLineWidth(0.3);
  doc.line(pageWidth / 2 - 30, y, pageWidth / 2 + 30, y);
  y += 4;
  doc.text('Tesorero', pageWidth / 2, y, { align: 'center' });

  // Footer
  y = 200;
  doc.setFontSize(7);
  doc.setTextColor(120);
  doc.text('Este recibo es un comprobante de pago válido.', pageWidth / 2, y, { align: 'center' });
  doc.setTextColor(0);

  return doc;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('es-EC', { day: '2-digit', month: 'long', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

/** Generate a unique receipt number based on timestamp */
export function generateReceiptNumber(): string {
  const now = new Date();
  const y = now.getFullYear().toString().slice(-2);
  const m = (now.getMonth() + 1).toString().padStart(2, '0');
  const d = now.getDate().toString().padStart(2, '0');
  const rand = Math.floor(Math.random() * 9999).toString().padStart(4, '0');
  return `R${y}${m}${d}-${rand}`;
}

export function downloadReceipt(doc: jsPDF, memberName: string) {
  const safeName = memberName.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 20);
  doc.save(`Recibo_${safeName}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function getReceiptWhatsAppMessage(
  memberName: string,
  concept: string,
  amountPaid: number,
  remaining?: number
): string {
  const firstName = memberName.split(' ')[0];
  let msg = `Estimado H∴ ${firstName},\n\n` +
    `Se ha registrado su pago correspondiente a: ${concept}\n` +
    `💰 Monto pagado: $${amountPaid.toFixed(2)}\n`;
  
  if (remaining && remaining > 0) {
    msg += `⚠️ Saldo pendiente: $${remaining.toFixed(2)}\n`;
  }

  msg += `\nFraternalmente,\nTesorería`;
  return msg;
}
