-- The current virement flow uses type_transaction = 'V' and is handled by
-- public.apply_savings_transaction_balance().
DROP TRIGGER IF EXISTS before_virement_out_insert ON public.transactions_epargne;
