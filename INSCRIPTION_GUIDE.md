# Guide d'Inscription et Authentification - BSO Portal

## ✅ Nouveau : Système d'Inscription Implémenté

### Ce qui a été ajouté

1. **Page d'inscription** ([pages/Register.tsx](pages/Register.tsx))
   - Formulaire complet avec validation
   - Création de compte Supabase Auth
   - Création automatique du profil dans la base de données
   - Messages d'erreur détaillés
   - Redirection automatique vers login après succès

2. **Service d'inscription** ([services/supabaseAuth.ts](services/supabaseAuth.ts))
   - Fonction `register()` exportée
   - Gestion de la création du user + profile
   - Fallback si la création du profil échoue
   - Persistance offline

3. **Navigation améliorée**
   - Lien "S'inscrire" sur la page de login
   - Lien "Se connecter" sur la page d'inscription
   - Routes protégées correctement configurées

---

## 🚀 Comment Utiliser

### 1. Démarrer l'application
```bash
npm run dev
```

### 2. Créer un nouveau compte

1. Ouvrir l'application dans le navigateur
2. Sur la page de connexion, cliquer sur **"S'inscrire"**
3. Remplir le formulaire :
   - **Prénom** (obligatoire)
   - **Nom** (obligatoire)
   - **Email** (obligatoire, doit contenir @)
   - **Mot de passe** (obligatoire, minimum 6 caractères)
   - **Confirmer le mot de passe** (doit correspondre)
4. Cliquer sur **"Créer mon compte"**
5. Attendre la confirmation (toast vert)
6. **Important** : Vérifier votre email pour confirmer l'inscription (selon config Supabase)
7. Redirection automatique vers la page de connexion après 2 secondes

### 3. Se connecter

1. Sur la page de login, entrer :
   - Email
   - Mot de passe
2. Cliquer sur **"Se connecter"**
3. Accès automatique à l'application

---

## 🔧 Configuration Supabase Requise

### 1. Email Confirmation (Optionnel)

Par défaut, Supabase envoie un email de confirmation. Pour désactiver :

1. Aller dans **Supabase Dashboard** → **Authentication** → **Settings**
2. Sous "Email Confirmations", décocher **"Enable email confirmations"**
3. Sauvegarder

### 2. RLS (Row Level Security)

Assurez-vous que les policies sont configurées pour la table `profiles` :

```sql
-- Allow users to read all profiles
CREATE POLICY "Profiles are viewable by everyone"
ON profiles FOR SELECT
USING (true);

-- Allow users to insert their own profile
CREATE POLICY "Users can insert their own profile"
ON profiles FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own profile
CREATE POLICY "Users can update their own profile"
ON profiles FOR UPDATE
USING (auth.uid() = user_id);
```

### 3. Trigger pour Auto-création du Profil (Recommandé)

Créer un trigger pour créer automatiquement le profil lors de l'inscription :

```sql
-- Function to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, firstname, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'firstname', ''),
    COALESCE(NEW.raw_user_meta_data->>'lastname', ''),
    4 -- Default role (Agent)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to call function on new user
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
```

---

## 🐛 Résolution du Problème 401

### Pourquoi j'avais des erreurs 401 ?

L'erreur 401 (Unauthorized) se produit quand :
1. ❌ **L'utilisateur n'existe pas** dans Supabase Auth
2. ❌ **Le mot de passe est incorrect**
3. ❌ **L'email n'est pas confirmé** (si email confirmation activée)

### Solution

Maintenant que l'inscription est implémentée :

1. **Créer un compte** via la page d'inscription
2. **Confirmer l'email** si Supabase l'exige
3. **Se connecter** avec les mêmes credentials

### Créer un premier utilisateur manuellement (Alternative)

Si vous voulez créer un utilisateur directement dans Supabase :

1. Aller dans **Supabase Dashboard** → **Authentication** → **Users**
2. Cliquer sur **"Add user"**
3. Entrer email et mot de passe
4. Cocher **"Auto Confirm User"** pour éviter la confirmation email
5. Créer l'utilisateur
6. Aller dans **Table Editor** → **profiles**
7. Créer manuellement le profil :
   ```json
   {
     "user_id": "<UUID de l'user créé>",
     "email": "votre@email.com",
     "firstname": "Votre",
     "name": "Nom",
     "role": 4
   }
   ```

---

## 📋 Fonctionnalités de l'Inscription

### Validation Frontend ✅
- Email valide (doit contenir @)
- Mot de passe minimum 6 caractères
- Confirmation du mot de passe
- Tous les champs obligatoires remplis

### Sécurité ✅
- Hachage automatique du mot de passe par Supabase
- Token JWT généré automatiquement
- Session sécurisée
- Toggle affichage/masquage du mot de passe

### UX ✅
- Messages d'erreur clairs et en français
- Indicateur de chargement pendant l'inscription
- Toast de succès
- Warning mode hors-ligne
- Redirection automatique après inscription
- Liens de navigation entre login/register

### Gestion d'Erreurs ✅
- Email déjà utilisé
- Mot de passe trop court
- Erreurs réseau
- Profil non créé (fallback)

---

## 🎨 Personnalisation

### Modifier le rôle par défaut

Dans [services/supabaseAuth.ts](services/supabaseAuth.ts:55) :
```typescript
role: 4, // Changer ici (1=Admin, 2=Manager, 3=Supervisor, 4=Agent)
```

### Changer les couleurs de la page

Dans [pages/Register.tsx](pages/Register.tsx:99) :
```typescript
bg-gradient-to-br from-green-500 to-teal-600
// Changer green-500 et teal-600 selon vos préférences
```

### Ajouter des champs supplémentaires

1. Ajouter dans `formData` :
```typescript
const [formData, setFormData] = useState({
  // ... champs existants
  telephone: '', // Nouveau champ
});
```

2. Ajouter l'input dans le JSX

3. Passer le champ à `registerUser()`

---

## 📝 Notes Importantes

### Email de Confirmation

- Par défaut, Supabase envoie un email de confirmation
- L'utilisateur **ne peut pas se connecter** tant qu'il n'a pas confirmé
- Pour tester sans email, désactiver dans Supabase Dashboard

### Offline Mode

- L'inscription **nécessite une connexion Internet**
- Un warning s'affiche si offline
- Le bouton est désactivé en mode hors-ligne

### Profil Auto-créé

- Le profil est créé automatiquement lors de l'inscription
- Si la création échoue, un profil temporaire est utilisé
- Recommandé : Utiliser un trigger Supabase pour garantir la création

---

## 🔍 Débogage

### Vérifier qu'un utilisateur est créé

1. Aller dans **Supabase Dashboard** → **Authentication** → **Users**
2. Chercher l'email utilisé
3. Vérifier le statut (Confirmed/Unconfirmed)

### Vérifier que le profil existe

1. Aller dans **Table Editor** → **profiles**
2. Chercher le `user_id` correspondant
3. Vérifier tous les champs sont remplis

### Logs dans la Console

Ouvrir les DevTools (F12) → **Console** :
- Voir les erreurs d'inscription
- Voir les réponses de Supabase
- Voir les erreurs de création de profil

---

## ✅ Checklist de Test

- [ ] Page d'inscription accessible depuis login
- [ ] Validation des champs fonctionne
- [ ] Mot de passe masqué/affiché avec toggle
- [ ] Création du compte réussie
- [ ] Email de confirmation reçu (si activé)
- [ ] Profil créé dans la base de données
- [ ] Redirection vers login après inscription
- [ ] Connexion réussie avec nouveau compte
- [ ] Toast de succès affiché
- [ ] Messages d'erreur en français

---

## 🎉 Résultat

Vous pouvez maintenant :
1. ✅ **Créer de nouveaux comptes** via l'interface
2. ✅ **Se connecter** avec les comptes créés
3. ✅ **Gérer les erreurs** d'authentification
4. ✅ **Avoir un système complet** login + register

**Fini les erreurs 401 !** 🚀
