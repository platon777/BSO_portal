-- Function to check for duplicates before insert or update
CREATE OR REPLACE FUNCTION check_duplicate_client()
RETURNS TRIGGER AS $$
DECLARE
  existing_id uuid;
BEGIN
  -- Check NIF/CIN uniqueness (ignoring null, empty, or 'nan')
  IF NEW.nif_cin IS NOT NULL AND NEW.nif_cin <> '' AND LOWER(NEW.nif_cin) <> 'nan' THEN
    SELECT id_personne INTO existing_id
    FROM personnes
    WHERE nif_cin = NEW.nif_cin
    AND id_personne <> COALESCE(NEW.id_personne, '00000000-0000-0000-0000-000000000000')
    LIMIT 1;

    IF existing_id IS NOT NULL THEN
      RAISE EXCEPTION 'Un client avec ce NIF/CIN existe déjà.';
    END IF;
  END IF;

  -- Check Phone Number uniqueness (ignoring null or empty)
  IF NEW.numero_telephone IS NOT NULL AND NEW.numero_telephone <> '' THEN
    SELECT id_personne INTO existing_id
    FROM personnes
    WHERE numero_telephone = NEW.numero_telephone
    AND id_personne <> COALESCE(NEW.id_personne, '00000000-0000-0000-0000-000000000000')
    LIMIT 1;

    IF existing_id IS NOT NULL THEN
      RAISE EXCEPTION 'Un client avec ce numéro de téléphone existe déjà.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create Trigger
DROP TRIGGER IF EXISTS prevent_duplicate_client_trigger ON personnes;

CREATE TRIGGER prevent_duplicate_client_trigger
BEFORE INSERT OR UPDATE ON personnes
FOR EACH ROW
EXECUTE FUNCTION check_duplicate_client();
