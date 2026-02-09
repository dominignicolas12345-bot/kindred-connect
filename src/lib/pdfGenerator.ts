import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import logoImg from '@/assets/logo-institucional.png';

interface ReportData {
  totalMonthlyIncome: number;
  totalExtraordinaryIncome: number;
  totalExpenses: number;
  balance: number;
  paymentsCount: number;
  pendingCount: number;
  expensesByCategory: Record<string, number>;
  memberPayments: Array<{
    memberName: string;
    totalPaid: number;
    paymentCount: number;
  }>;
  debtors: Array<{
    memberName: string;
    pendingMonths: number;
  }>;
  extraordinaryDetails?: Array<{
    name: string;
    collected: number;
    expected: number;
  }>;
  expensesDetail?: Array<{
    description: string;
    category: string;
    amount: number;
    date: string;
  }>;
}

interface MonthlyBreakdown {
  month: string;
  monthlyIncome: number;
  extraordinaryIncome: number;
  expenses: number;
  balance: number;
}

interface CollectionLetterData {
  memberName: string;
  memberDegree: string;
  institutionName: string;
  monthsOverdue: number;
  totalOwed: number;
  pendingMonths: Array<{ month: number; year: number; amount: number; monthName?: string }>;
  treasurerName: string;
  treasurerDegree: string;
  currentDate: string;
}

const CATEGORIES: Record<string, string> = {
  'alimentacion': 'Alimentación',
  'alquiler': 'Alquiler',
  'servicios': 'Servicios Básicos',
  'articulos': 'Artículos',
  'membresia': 'Membresía',
  'filantropia': 'Filantropía',
  'eventos': 'Eventos',
  'otros': 'Otros',
};

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

// Helper function to add logo to PDF
async function addLogoToPDF(doc: jsPDF): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      // Place logo in top-left corner with proper proportions
      const maxWidth = 30;
      const maxHeight = 20;
      const ratio = Math.min(maxWidth / img.width, maxHeight / img.height);
      const width = img.width * ratio;
      const height = img.height * ratio;
      doc.addImage(img, 'PNG', 15, 10, width, height);
      resolve();
    };
    img.onerror = () => {
      // If logo fails to load, continue without it
      resolve();
    };
    img.src = logoImg;
  });
}

export async function generateMonthlyPDF(
  report: ReportData,
  month: number,
  year: number,
  institutionName: string,
  customTemplate: string
): Promise<jsPDF> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const monthName = MONTHS[month - 1];
  
  // Add logo
  await addLogoToPDF(doc);
  
  let yPos = 35;

  // Header with institution name
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(institutionName, pageWidth / 2, yPos, { align: 'center' });
  
  yPos += 10;
  doc.setFontSize(14);
  doc.text('INFORME MENSUAL DE TESORERÍA', pageWidth / 2, yPos, { align: 'center' });
  
  yPos += 8;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`${monthName} ${year}`, pageWidth / 2, yPos, { align: 'center' });
  
  // Separator line
  yPos += 8;
  doc.setLineWidth(0.5);
  doc.line(20, yPos, pageWidth - 20, yPos);
  
  // Custom template text
  yPos += 10;
  doc.setFontSize(10);
  const splitTemplate = doc.splitTextToSize(customTemplate, pageWidth - 40);
  doc.text(splitTemplate, 20, yPos);
  yPos += splitTemplate.length * 5 + 5;

  // TESORERÍA - Cuotas mensuales
  yPos += 5;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('TESORERÍA - CUOTAS MENSUALES', 20, yPos);
  
  yPos += 8;
  autoTable(doc, {
    startY: yPos,
    head: [['Concepto', 'Valor']],
    body: [
      ['Total recaudado por cuotas mensuales', `$${report.totalMonthlyIncome.toFixed(2)}`],
      ['Miembros que pagaron', report.paymentsCount.toString()],
      ['Miembros que no pagaron', report.pendingCount.toString()],
    ],
    theme: 'striped',
    headStyles: { fillColor: [66, 66, 66] },
    styles: { fontSize: 10 },
  });

  yPos = (doc as any).lastAutoTable.finalY + 10;

  // CUOTAS EXTRAORDINARIAS
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('CUOTAS EXTRAORDINARIAS', 20, yPos);
  
  yPos += 8;
  if (report.extraordinaryDetails && report.extraordinaryDetails.length > 0) {
    autoTable(doc, {
      startY: yPos,
      head: [['Nombre de la cuota', 'Valor establecido', 'Valor recaudado']],
      body: report.extraordinaryDetails.map(e => [
        e.name,
        `$${e.expected.toFixed(2)}`,
        `$${e.collected.toFixed(2)}`
      ]),
      foot: [['TOTAL RECAUDADO', '', `$${report.totalExtraordinaryIncome.toFixed(2)}`]],
      theme: 'striped',
      headStyles: { fillColor: [66, 66, 66] },
      footStyles: { fillColor: [200, 200, 200], textColor: [0, 0, 0], fontStyle: 'bold' },
      styles: { fontSize: 10 },
    });
    yPos = (doc as any).lastAutoTable.finalY + 10;
  } else {
    autoTable(doc, {
      startY: yPos,
      head: [['Cuotas extraordinarias']],
      body: [['No se registraron cuotas extraordinarias en este período']],
      theme: 'striped',
      headStyles: { fillColor: [66, 66, 66] },
      styles: { fontSize: 10 },
    });
    yPos = (doc as any).lastAutoTable.finalY + 10;
  }

  // Check if we need a new page
  if (yPos > 200) {
    doc.addPage();
    await addLogoToPDF(doc);
    yPos = 40;
  }

  // GASTOS
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('GASTOS', 20, yPos);
  
  yPos += 8;
  if (report.expensesDetail && report.expensesDetail.length > 0) {
    autoTable(doc, {
      startY: yPos,
      head: [['Descripción', 'Categoría', 'Fecha', 'Monto']],
      body: report.expensesDetail.map(e => [
        e.description,
        CATEGORIES[e.category] || e.category,
        new Date(e.date).toLocaleDateString('es-EC'),
        `$${e.amount.toFixed(2)}`
      ]),
      foot: [['TOTAL DE GASTOS', '', '', `$${report.totalExpenses.toFixed(2)}`]],
      theme: 'striped',
      headStyles: { fillColor: [66, 66, 66] },
      footStyles: { fillColor: [200, 200, 200], textColor: [0, 0, 0], fontStyle: 'bold' },
      styles: { fontSize: 9 },
    });
    yPos = (doc as any).lastAutoTable.finalY + 10;
  } else {
    autoTable(doc, {
      startY: yPos,
      head: [['Gastos']],
      body: [['No se registraron gastos en este período']],
      theme: 'striped',
      headStyles: { fillColor: [66, 66, 66] },
      styles: { fontSize: 10 },
    });
    yPos = (doc as any).lastAutoTable.finalY + 10;
  }

  // RESUMEN FINANCIERO
  if (yPos > 230) {
    doc.addPage();
    await addLogoToPDF(doc);
    yPos = 40;
  }

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('RESUMEN FINANCIERO DEL PERÍODO', 20, yPos);
  
  yPos += 8;
  autoTable(doc, {
    startY: yPos,
    head: [['Concepto', 'Monto']],
    body: [
      ['Total ingresos cuotas mensuales', `$${report.totalMonthlyIncome.toFixed(2)}`],
      ['Total ingresos cuotas extraordinarias', `$${report.totalExtraordinaryIncome.toFixed(2)}`],
      ['Total ingresos', `$${(report.totalMonthlyIncome + report.totalExtraordinaryIncome).toFixed(2)}`],
      ['Total egresos', `$${report.totalExpenses.toFixed(2)}`],
      ['Balance del período', `$${report.balance.toFixed(2)}`],
    ],
    theme: 'striped',
    headStyles: { fillColor: [66, 66, 66] },
    styles: { fontSize: 10 },
  });

  // Footer on all pages
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const now = new Date();
    const dateStr = now.toLocaleDateString('es-EC', { 
      day: '2-digit', 
      month: 'long', 
      year: 'numeric',
      timeZone: 'America/Guayaquil'
    });
    doc.text(
      `Generado el ${dateStr} - Página ${i} de ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
  }

  return doc;
}

export async function generateAnnualPDF(
  report: ReportData,
  year: number,
  institutionName: string,
  customTemplate: string,
  monthlyBreakdown?: MonthlyBreakdown[]
): Promise<jsPDF> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Add logo
  await addLogoToPDF(doc);
  
  let yPos = 35;

  // Header with institution name
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(institutionName, pageWidth / 2, yPos, { align: 'center' });
  
  yPos += 10;
  doc.setFontSize(14);
  doc.text('INFORME ANUAL DE TESORERÍA', pageWidth / 2, yPos, { align: 'center' });
  
  yPos += 8;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`Año ${year}`, pageWidth / 2, yPos, { align: 'center' });
  
  // Separator line
  yPos += 8;
  doc.setLineWidth(0.5);
  doc.line(20, yPos, pageWidth - 20, yPos);
  
  // Custom template text
  yPos += 10;
  doc.setFontSize(10);
  const splitTemplate = doc.splitTextToSize(customTemplate, pageWidth - 40);
  doc.text(splitTemplate, 20, yPos);
  yPos += splitTemplate.length * 5 + 5;

  // RESUMEN FINANCIERO ANUAL
  yPos += 5;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('RESUMEN FINANCIERO ANUAL', 20, yPos);
  
  yPos += 8;
  autoTable(doc, {
    startY: yPos,
    head: [['Concepto', 'Monto Anual']],
    body: [
      ['Total anual recaudado en Tesorería (cuotas mensuales)', `$${report.totalMonthlyIncome.toFixed(2)}`],
      ['Total anual recaudado por cuotas extraordinarias', `$${report.totalExtraordinaryIncome.toFixed(2)}`],
      ['Total consolidado de ingresos', `$${(report.totalMonthlyIncome + report.totalExtraordinaryIncome).toFixed(2)}`],
      ['Total anual de gastos', `$${report.totalExpenses.toFixed(2)}`],
      ['Balance anual', `$${report.balance.toFixed(2)}`],
    ],
    theme: 'striped',
    headStyles: { fillColor: [66, 66, 66] },
    styles: { fontSize: 10 },
  });

  yPos = (doc as any).lastAutoTable.finalY + 10;

  // CUOTAS EXTRAORDINARIAS DEL AÑO
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('RESUMEN DE CUOTAS EXTRAORDINARIAS', 20, yPos);
  
  yPos += 8;
  if (report.extraordinaryDetails && report.extraordinaryDetails.length > 0) {
    autoTable(doc, {
      startY: yPos,
      head: [['Cuota', 'Valor establecido', 'Valor recaudado']],
      body: report.extraordinaryDetails.map(e => [
        e.name,
        `$${e.expected.toFixed(2)}`,
        `$${e.collected.toFixed(2)}`
      ]),
      foot: [[
        `Total cuotas: ${report.extraordinaryDetails.length}`, 
        `$${report.extraordinaryDetails.reduce((s, e) => s + e.expected, 0).toFixed(2)}`,
        `$${report.totalExtraordinaryIncome.toFixed(2)}`
      ]],
      theme: 'striped',
      headStyles: { fillColor: [66, 66, 66] },
      footStyles: { fillColor: [200, 200, 200], textColor: [0, 0, 0], fontStyle: 'bold' },
      styles: { fontSize: 10 },
    });
    yPos = (doc as any).lastAutoTable.finalY + 10;
  } else {
    autoTable(doc, {
      startY: yPos,
      body: [['No se registraron cuotas extraordinarias en el año']],
      theme: 'plain',
      styles: { fontSize: 10 },
    });
    yPos = (doc as any).lastAutoTable.finalY + 10;
  }

  // Check if we need a new page
  if (yPos > 200) {
    doc.addPage();
    await addLogoToPDF(doc);
    yPos = 40;
  }

  // Monthly breakdown if provided
  if (monthlyBreakdown && monthlyBreakdown.length > 0) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('RESUMEN MENSUAL COMPARATIVO', 20, yPos);
    
    yPos += 8;
    autoTable(doc, {
      startY: yPos,
      head: [['Mes', 'Cuotas Mensuales', 'Extraordinarios', 'Egresos', 'Balance']],
      body: monthlyBreakdown.map(m => [
        m.month,
        `$${m.monthlyIncome.toFixed(2)}`,
        `$${m.extraordinaryIncome.toFixed(2)}`,
        `$${m.expenses.toFixed(2)}`,
        `$${m.balance.toFixed(2)}`
      ]),
      theme: 'striped',
      headStyles: { fillColor: [66, 66, 66] },
      styles: { fontSize: 9 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;
  }

  // Check if we need a new page
  if (yPos > 220) {
    doc.addPage();
    await addLogoToPDF(doc);
    yPos = 40;
  }

  // Annual expense breakdown by category
  const categoryEntries = Object.entries(report.expensesByCategory);
  if (categoryEntries.length > 0) {
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('EGRESOS ANUALES POR CATEGORÍA', 20, yPos);
    
    yPos += 8;
    autoTable(doc, {
      startY: yPos,
      head: [['Categoría', 'Monto Total']],
      body: categoryEntries.map(([cat, amount]) => [
        CATEGORIES[cat] || cat,
        `$${amount.toFixed(2)}`
      ]),
      theme: 'striped',
      headStyles: { fillColor: [66, 66, 66] },
      styles: { fontSize: 10 },
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;
  }

  // Footer on all pages
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    const now = new Date();
    const dateStr = now.toLocaleDateString('es-EC', { 
      day: '2-digit', 
      month: 'long', 
      year: 'numeric',
      timeZone: 'America/Guayaquil'
    });
    doc.text(
      `Generado el ${dateStr} - Página ${i} de ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
  }

  return doc;
}

export async function generateCollectionLetterPDF(data: CollectionLetterData): Promise<jsPDF> {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Formal letter margins
  const marginLeft = 25;
  const marginRight = 25;
  const contentWidth = pageWidth - marginLeft - marginRight;
  const lineHeight = 5; // Compact line height for formal letter
  
  // Add logo (smaller for formal letter)
  await addLogoToPDF(doc);
  
  let yPos = 50;
  
  // Date - right aligned
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Quito, ${data.currentDate}`, pageWidth - marginRight, yPos, { align: 'right' });
  
  yPos += 12;
  
  // Recipient
  doc.setFont('helvetica', 'bold');
  doc.text(`H∴ ${data.memberName}`, marginLeft, yPos);
  yPos += lineHeight;
  doc.setFont('helvetica', 'normal');
  doc.text('Presente.-', marginLeft, yPos);
  
  yPos += 10;
  
  // Body text - Compact formal letter format
  const paragraph1 = `Reciba un cordial y fraternal saludo en nombre de todos los miembros de la ${data.institutionName}.`;
  
  const paragraph2 = `Nos dirigimos a usted con el propósito de recordarle su compromiso con nuestra institución en relación con el pago de las cuotas establecidas. A la fecha, se han identificado las siguientes cuotas pendientes:`;
  
  doc.setFontSize(10);
  let splitText = doc.splitTextToSize(paragraph1, contentWidth);
  doc.text(splitText, marginLeft, yPos);
  yPos += splitText.length * lineHeight + 4;
  
  splitText = doc.splitTextToSize(paragraph2, contentWidth);
  doc.text(splitText, marginLeft, yPos);
  yPos += splitText.length * lineHeight + 6;
  
  // Debt details - compact list format
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`Meses pendientes (${data.monthsOverdue}):`, marginLeft, yPos);
  yPos += lineHeight + 2;
  
  // List pending months - compact vertical list
  if (data.pendingMonths && data.pendingMonths.length > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    
    for (const pm of data.pendingMonths) {
      const monthName = pm.monthName || ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][pm.month - 1];
      doc.text(`• ${monthName} ${pm.year}: $${pm.amount.toFixed(2)}`, marginLeft + 5, yPos);
      yPos += 4;
    }
    yPos += 2;
  }
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`TOTAL ADEUDADO: $${data.totalOwed.toFixed(2)}`, marginLeft, yPos);
  yPos += 8;
  
  // Continuation paragraphs - more compact
  doc.setFont('helvetica', 'normal');
  
  const paragraph3 = `Es comprensible que puedan surgir situaciones imprevistas; sin embargo, las aportaciones de todos los hermanos son esenciales para el sostenimiento de nuestras actividades.`;
  
  splitText = doc.splitTextToSize(paragraph3, contentWidth);
  doc.text(splitText, marginLeft, yPos);
  yPos += splitText.length * lineHeight + 4;
  
  const paragraph4 = `Si considera que el saldo es incorrecto, comuníquese con el Tesorero para revisar su caso. Le solicitamos regularizar su situación a la brevedad posible o establecer un plan de pagos.`;
  
  splitText = doc.splitTextToSize(paragraph4, contentWidth);
  doc.text(splitText, marginLeft, yPos);
  yPos += splitText.length * lineHeight + 4;
  
  const paragraph5 = `Reiteramos nuestro compromiso fraternal y confiamos en su disposición para resolver esta situación oportunamente.`;
  
  splitText = doc.splitTextToSize(paragraph5, contentWidth);
  doc.text(splitText, marginLeft, yPos);
  yPos += splitText.length * lineHeight + 8;
  
  // Closing
  doc.text('Con estima y fraternidad,', marginLeft, yPos);
  yPos += 18;
  
  // Signature block - compact formal format
  doc.setFont('helvetica', 'bold');
  doc.text(`${data.treasurerDegree} ${data.treasurerName}`.toUpperCase(), marginLeft, yPos);
  yPos += lineHeight;
  doc.setFont('helvetica', 'normal');
  doc.text('TESORERO', marginLeft, yPos);
  yPos += lineHeight;
  doc.text(data.institutionName, marginLeft, yPos);

  return doc;
}
