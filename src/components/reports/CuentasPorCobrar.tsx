import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Eye, Download, FileWarning } from 'lucide-react';
import { useDataCache, type Member, type MonthlyPayment, type ExtraordinaryPayment, type ExtraordinaryIncome } from '@/hooks/useDataCache';
import { useSettings } from '@/contexts/SettingsContext';
import { getFiscalYearInfo, MONTH_NAMES } from '@/lib/dateUtils';
import { generateCollectionLetterPDF } from '@/lib/pdfGenerator';
import { getFormattedSystemDate } from '@/lib/dateUtils';

interface MemberDebt {
  member: Member;
  treasuryPending: Array<{ month: number; year: number; monthName: string; amount: number; paid: number }>;
  treasuryTotal: number;
  extraordinaryPending: Array<{ feeName: string; amount: number; paid: number; pending: number }>;
  extraordinaryTotal: number;
  degreeFeesPending: number;
  grandTotal: number;
}

export default function CuentasPorCobrar() {
  const [selectedMember, setSelectedMember] = useState<MemberDebt | null>(null);
  const { activeMembers, monthlyPayments, extraordinaryIncomes, extraordinaryPayments } = useDataCache();
  const { settings } = useSettings();
  const { currentCalendarYear, nextCalendarYear } = getFiscalYearInfo();
  const treasurer = useDataCache().treasurer;

  const memberDebts = useMemo(() => {
    const debts: MemberDebt[] = [];

    activeMembers.forEach(member => {
      const memberFee = member.treasury_amount || settings.monthly_fee_base;
      const treasuryPending: MemberDebt['treasuryPending'] = [];
      let treasuryTotal = 0;

      for (let i = 0; i < 12; i++) {
        const year = i < 6 ? currentCalendarYear : nextCalendarYear;
        const month = i < 6 ? i + 7 : i - 5;
        const payment = monthlyPayments.find(p => p.member_id === member.id && p.month === month && p.year === year);

        if (!payment) {
          treasuryPending.push({ month, year, monthName: MONTH_NAMES[month - 1], amount: memberFee, paid: 0 });
          treasuryTotal += memberFee;
        } else if (payment.payment_type !== 'pronto_pago_benefit' && payment.amount < memberFee) {
          const pending = memberFee - payment.amount;
          treasuryPending.push({ month, year, monthName: MONTH_NAMES[month - 1], amount: memberFee, paid: payment.amount });
          treasuryTotal += pending;
        }
      }

      const extraordinaryPending: MemberDebt['extraordinaryPending'] = [];
      let extraordinaryTotal = 0;

      extraordinaryIncomes.forEach(income => {
        const payment = extraordinaryPayments.find(
          p => p.extraordinary_fee_id === income.id && p.member_id === member.id
        );
        const paid = payment ? Number(payment.amount_paid) : 0;
        const pending = Number(income.amount_per_member) - paid;
        if (pending > 0) {
          extraordinaryPending.push({ feeName: income.name, amount: Number(income.amount_per_member), paid, pending });
          extraordinaryTotal += pending;
        }
      });

      const grandTotal = treasuryTotal + extraordinaryTotal;

      if (grandTotal > 0) {
        debts.push({ member, treasuryPending, treasuryTotal, extraordinaryPending, extraordinaryTotal, degreeFeesPending: 0, grandTotal });
      }
    });

    return debts.sort((a, b) => b.grandTotal - a.grandTotal);
  }, [activeMembers, monthlyPayments, extraordinaryIncomes, extraordinaryPayments, settings.monthly_fee_base, currentCalendarYear, nextCalendarYear]);

  const handleDownloadPDF = async (debt: MemberDebt) => {
    const GRADE_LABELS: Record<string, string> = {
      aprendiz: 'Apr.', companero: 'Comp.', maestro: 'M.',
    };
    try {
      const pdf = await generateCollectionLetterPDF({
        memberName: debt.member.full_name,
        memberDegree: GRADE_LABELS[debt.member.degree || ''] || '',
        institutionName: settings.institution_name,
        monthsOverdue: debt.treasuryPending.length,
        totalOwed: debt.grandTotal,
        pendingMonths: debt.treasuryPending.map(p => ({
          month: p.month, year: p.year, amount: p.amount - p.paid, monthName: p.monthName,
        })),
        treasurerName: treasurer?.full_name || 'Tesorero',
        treasurerDegree: GRADE_LABELS[treasurer?.degree || ''] || '',
        currentDate: getFormattedSystemDate(),
      });
      pdf.save(`Comunicado_Mora_${debt.member.full_name.replace(/\s+/g, '_')}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
    }
  };

  if (memberDebts.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileWarning className="h-5 w-5" /> Cuentas por Cobrar</CardTitle>
          <CardDescription>No hay cuentas pendientes</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            Todos los miembros estan al dia con sus pagos.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileWarning className="h-5 w-5" /> Cuentas por Cobrar / Comunicado por Mora</CardTitle>
          <CardDescription>
            Desglose de deudas por miembro. Descargue el comunicado por mora en PDF para cada miembro.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Miembro</TableHead>
                  <TableHead className="text-right">Tesoreria</TableHead>
                  <TableHead className="text-right">Extraordinarias</TableHead>
                  <TableHead className="text-right font-bold">Total</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {memberDebts.map(debt => (
                  <TableRow key={debt.member.id}>
                    <TableCell className="font-medium">{debt.member.full_name}</TableCell>
                    <TableCell className="text-right text-destructive">${debt.treasuryTotal.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-destructive">${debt.extraordinaryTotal.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-bold text-destructive">${debt.grandTotal.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => setSelectedMember(debt)} title="Ver detalle">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDownloadPDF(debt)} title="Descargar Comunicado por Mora">
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedMember} onOpenChange={() => setSelectedMember(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cuentas por Cobrar - {selectedMember?.member.full_name}</DialogTitle>
          </DialogHeader>

          {selectedMember && (
            <div className="space-y-4">
              {selectedMember.treasuryPending.length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm mb-2">Tesoreria - Meses pendientes</h4>
                  <div className="space-y-1">
                    {selectedMember.treasuryPending.map((p, i) => (
                      <div key={i} className="flex justify-between text-sm p-2 rounded bg-muted/50">
                        <span>{p.monthName} {p.year}</span>
                        <div className="text-right">
                          {p.paid > 0 && <span className="text-muted-foreground mr-2">Abono: ${p.paid.toFixed(2)}</span>}
                          <span className="font-bold text-destructive">Pendiente: ${(p.amount - p.paid).toFixed(2)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-sm font-bold mt-2 pt-2 border-t">
                    <span>Total Tesoreria:</span>
                    <span className="text-destructive">${selectedMember.treasuryTotal.toFixed(2)}</span>
                  </div>
                </div>
              )}

              {selectedMember.extraordinaryPending.length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm mb-2">Cuotas Extraordinarias</h4>
                  <div className="space-y-1">
                    {selectedMember.extraordinaryPending.map((p, i) => (
                      <div key={i} className="flex justify-between text-sm p-2 rounded bg-muted/50">
                        <span>{p.feeName}</span>
                        <span className="font-bold text-destructive">Pendiente: ${p.pending.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between text-sm font-bold mt-2 pt-2 border-t">
                    <span>Total Extraordinarias:</span>
                    <span className="text-destructive">${selectedMember.extraordinaryTotal.toFixed(2)}</span>
                  </div>
                </div>
              )}

              <div className="flex justify-between p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                <span className="font-bold">TOTAL ADEUDADO:</span>
                <span className="font-bold text-destructive text-lg">${selectedMember.grandTotal.toFixed(2)}</span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setSelectedMember(null)}>Cerrar</Button>
                <Button onClick={() => selectedMember && handleDownloadPDF(selectedMember)}>
                  <Download className="mr-2 h-4 w-4" /> Descargar Comunicado por Mora
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
