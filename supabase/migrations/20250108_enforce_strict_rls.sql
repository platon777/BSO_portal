-- Enforce strict RLS: Agents can INSERT, but UPDATE/DELETE requires Temp Access

-- 1. Personnes
DROP POLICY IF EXISTS "Agents can UPDATE personnes" ON personnes;
DROP POLICY IF EXISTS "Agents can DELETE personnes" ON personnes;

CREATE POLICY "Agents can UPDATE personnes" ON personnes
FOR UPDATE
TO public
USING (has_access_to_client(id_personne::text));

CREATE POLICY "Agents can DELETE personnes" ON personnes
FOR DELETE
TO public
USING (has_access_to_client(id_personne::text));

-- Ensure INSERT is open (if not already)
DROP POLICY IF EXISTS "Agents can INSERT personnes" ON personnes;
CREATE POLICY "Agents can INSERT personnes" ON personnes
FOR INSERT
TO public
WITH CHECK (true);


-- 2. Comptes Epargne
DROP POLICY IF EXISTS "Agents can UPDATE comptes_epargne" ON comptes_epargne;
DROP POLICY IF EXISTS "Agents can DELETE comptes_epargne" ON comptes_epargne;

CREATE POLICY "Agents can UPDATE comptes_epargne" ON comptes_epargne
FOR UPDATE
TO public
USING (has_access_to_client(id_personne::text));

CREATE POLICY "Agents can DELETE comptes_epargne" ON comptes_epargne
FOR DELETE
TO public
USING (has_access_to_client(id_personne::text));

-- Ensure INSERT is open
DROP POLICY IF EXISTS "Agents can INSERT comptes_epargne" ON comptes_epargne;
CREATE POLICY "Agents can INSERT comptes_epargne" ON comptes_epargne
FOR INSERT
TO public
WITH CHECK (true);


-- 3. Comptes Credit
DROP POLICY IF EXISTS "Agents can UPDATE comptes_credit" ON comptes_credit;
DROP POLICY IF EXISTS "Agents can DELETE comptes_credit" ON comptes_credit;

CREATE POLICY "Agents can UPDATE comptes_credit" ON comptes_credit
FOR UPDATE
TO public
USING (has_access_to_client(id_personne::text));

CREATE POLICY "Agents can DELETE comptes_credit" ON comptes_credit
FOR DELETE
TO public
USING (has_access_to_client(id_personne::text));

-- Ensure INSERT is open
DROP POLICY IF EXISTS "Agents can INSERT comptes_credit" ON comptes_credit;
CREATE POLICY "Agents can INSERT comptes_credit" ON comptes_credit
FOR INSERT
TO public
WITH CHECK (true);


-- 4. Transactions Epargne
DROP POLICY IF EXISTS "Agents can UPDATE transactions_epargne" ON transactions_epargne;
DROP POLICY IF EXISTS "Agents can DELETE transactions_epargne" ON transactions_epargne;

CREATE POLICY "Agents can UPDATE transactions_epargne" ON transactions_epargne
FOR UPDATE
TO public
USING (
  has_access_to_client((SELECT id_personne::text FROM comptes_epargne WHERE id_compte_epargne = transactions_epargne.id_compte_epargne))
);

CREATE POLICY "Agents can DELETE transactions_epargne" ON transactions_epargne
FOR DELETE
TO public
USING (
  has_access_to_client((SELECT id_personne::text FROM comptes_epargne WHERE id_compte_epargne = transactions_epargne.id_compte_epargne))
);

-- Ensure INSERT is open
DROP POLICY IF EXISTS "Agents can INSERT transactions_epargne" ON transactions_epargne;
CREATE POLICY "Agents can INSERT transactions_epargne" ON transactions_epargne
FOR INSERT
TO public
WITH CHECK (true);


-- 5. Transactions Credit
DROP POLICY IF EXISTS "Agents can UPDATE transactions_credit" ON transactions_credit;
DROP POLICY IF EXISTS "Agents can DELETE transactions_credit" ON transactions_credit;

CREATE POLICY "Agents can UPDATE transactions_credit" ON transactions_credit
FOR UPDATE
TO public
USING (
  has_access_to_client((SELECT id_personne::text FROM comptes_credit WHERE id_compte_credit = transactions_credit.id_compte_credit))
);

CREATE POLICY "Agents can DELETE transactions_credit" ON transactions_credit
FOR DELETE
TO public
USING (
  has_access_to_client((SELECT id_personne::text FROM comptes_credit WHERE id_compte_credit = transactions_credit.id_compte_credit))
);

-- Ensure INSERT is open
DROP POLICY IF EXISTS "Agents can INSERT transactions_credit" ON transactions_credit;
CREATE POLICY "Agents can INSERT transactions_credit" ON transactions_credit
FOR INSERT
TO public
WITH CHECK (true);
