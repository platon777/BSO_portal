-- Add transaction_id to temporary_access_grants
ALTER TABLE temporary_access_grants 
ADD COLUMN transaction_id UUID REFERENCES transactions_epargne(id_transaction_epargne) ON DELETE CASCADE;

-- Update has_access_to_client function to handle transaction-specific access
CREATE OR REPLACE FUNCTION public.has_access_to_client(client_id_param text, transaction_id_param text DEFAULT NULL)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
    -- Check if user is Admin (Role 1)
    IF EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 1) THEN
        RETURN TRUE;
    END IF;

    -- Check for valid temporary grant for the client (global access)
    IF EXISTS (SELECT 1 FROM public.temporary_access_grants 
               WHERE agent_id = auth.uid() 
               AND client_id = client_id_param 
               AND transaction_id IS NULL
               AND expires_at > now()) THEN
        RETURN TRUE;
    END IF;

    -- Check for valid temporary grant for the specific transaction
    IF transaction_id_param IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.temporary_access_grants 
                   WHERE agent_id = auth.uid() 
                   AND transaction_id = transaction_id_param::uuid
                   AND expires_at > now()) THEN
            RETURN TRUE;
        END IF;
    END IF;

    RETURN FALSE;
END;
$function$;
