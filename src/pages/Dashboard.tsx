import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDataCache } from '@/hooks/useDataCache';
import { useState, useMemo, useEffect, memo } from 'react';
import { useBirthdayMembers, generateBirthdayWhatsAppLink } from '@/hooks/useBirthdayMembers';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';

const StatCard = memo(function StatCard({ 
  title, value, icon: Icon, iconColor, valueColor, subtitle, onClick
}: { 
  title: string; value: string | number; icon: React.ComponentType<{ className?: string }>;
  iconColor?: string; valueColor?: string; subtitle?: string; onClick?: () => void;
}) {
  return (
    <Card className={onClick ? 'cursor-pointer hover:bg-muted/50 transition-colors' : ''} onClick={onClick}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${iconColor || 'text-muted-foreground'}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${valueColor || ''}`}>{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
});

function Dashboard() {
  const navigate = useNavigate();
  const { summary, members, expenses, monthlyPayments, extraordinaryPayments } = useDataCache();
  const birthdayMembers = useBirthdayMembers(members);
  const [showIncomeDetail, setShowIncomeDetail] = useState(false);
  const [showExpenseDetail, setShowExpenseDetail] = useState(false);
  const [degreeFeeTotal, setDegreeFeeTotal] = useState(0);

  const stats = summary || {
    totalIncome: 0, totalExpenses: 0, totalExtraordinaryIncome: 0, balance: 0, memberCount: 0, pendingPayments: 0
  };

  // Fetch degree fees total
  useEffect(() => {
    const fetchDegreeFees = async () => {
      const { data } = await supabase.from('degree_fees').select('amount');
      if (data) {
        setDegreeFeeTotal(data.reduce((sum, d) => sum + Number(d.amount), 0));
      }
    };
    fetchDegreeFees();
  }, []);

  const treasuryIncome = useMemo(() => {
    return monthlyPayments
      .filter(p => p.payment_type !== 'pronto_pago_benefit')
      .reduce((sum, p) => sum + Number(p.amount), 0);
  }, [monthlyPayments]);

  const extraordinaryIncome = useMemo(() => {
    return extraordinaryPayments.reduce((sum, p) => sum + Number(p.amount_paid), 0);
  }, [extraordinaryPayments]);

  const totalIncome = treasuryIncome + extraordinaryIncome + degreeFeeTotal;
  const totalExpenses = stats.totalExpenses;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-bold">Dashboard</h1>
        <p className="mt-2 text-xl text-muted-foreground">Sistema de Gestion de Logia</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <StatCard
          title="Total Ingresos"
          value={`$${totalIncome.toFixed(2)}`}
          icon={TrendingUp}
          iconColor="text-success"
          subtitle="Clic para ver desglose"
          onClick={() => setShowIncomeDetail(true)}
        />

        <StatCard
          title="Total Gastos"
          value={`$${totalExpenses.toFixed(2)}`}
          icon={TrendingDown}
          iconColor="text-destructive"
          subtitle="Clic para ver detalle"
          onClick={() => setShowExpenseDetail(true)}
        />
      </div>

      {/* Birthdays */}
      {birthdayMembers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Cumpleanos Hoy</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {birthdayMembers.map(member => (
                member.phone && (
                  <Button key={member.id} size="sm" variant="outline"
                    className="h-7 text-xs gap-1 bg-success/10 border-success/30 hover:bg-success/20"
                    onClick={() => window.open(generateBirthdayWhatsAppLink(member), '_blank')}>
                    <MessageCircle className="h-3 w-3" />
                    {member.full_name.split(' ')[0]}
                  </Button>
                )
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Income Detail */}
      <Dialog open={showIncomeDetail} onOpenChange={setShowIncomeDetail}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Desglose de Ingresos</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
              <span className="text-sm font-medium">Tesoreria (cuotas mensuales)</span>
              <span className="font-bold">${treasuryIncome.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
              <span className="text-sm font-medium">Cuotas extraordinarias</span>
              <span className="font-bold">${extraordinaryIncome.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
              <span className="text-sm font-medium">Derechos de grado</span>
              <span className="font-bold">${degreeFeeTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center p-3 rounded-lg border-t pt-4">
              <span className="text-sm font-bold">Total ingresos</span>
              <span className="text-lg font-bold text-success">${totalIncome.toFixed(2)}</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Expense Detail */}
      <Dialog open={showExpenseDetail} onOpenChange={setShowExpenseDetail}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle de Gastos</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {expenses.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No hay gastos registrados</p>
            ) : (
              expenses.slice(0, 20).map(expense => (
                <div key={expense.id} className="flex justify-between items-center p-3 rounded-lg bg-muted/50">
                  <div>
                    <p className="text-sm font-medium">{expense.description}</p>
                    <p className="text-xs text-muted-foreground">{expense.category} - {expense.expense_date}</p>
                  </div>
                  <span className="font-bold text-destructive">${Number(expense.amount).toFixed(2)}</span>
                </div>
              ))
            )}
            {expenses.length > 20 && (
              <Button variant="outline" className="w-full" onClick={() => { setShowExpenseDetail(false); navigate('/expenses'); }}>
                Ver todos los gastos
              </Button>
            )}
            <div className="flex justify-between items-center p-3 rounded-lg border-t pt-4">
              <span className="text-sm font-bold">Total gastos</span>
              <span className="text-lg font-bold text-destructive">${totalExpenses.toFixed(2)}</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default Dashboard;
