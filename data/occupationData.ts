// Categorisation Occupation - Secteurs, Activités, Capacité distribution, Point de vente

export const SECTEURS = [
  'Alimentaire',
  'Boissons',
  'Vêtements et friperie',
  'Chaussures et accessoires vestimentaires',
  'Cosmétique / Beauté',
  'Téléphones / électronique',
  'Quincaillerie / pièces / mécanique',
  'Boutique / articles divers',
  'Produits importés / Saint-Domingue',
  'Botanica',
  'Commerce général',
  'Artisanat / métiers manuels',
  'Transport',
  'Services professionnels',
  'Finance informelle',
] as const;

export type Secteur = typeof SECTEURS[number];

export const ACTIVITES_PAR_SECTEUR: Record<Secteur, string[]> = {
  'Alimentaire': [
    'Nourriture cuite',
    'Fruits et légumes',
    'Provisions alimentaires',
    'Viande / poisson',
    'Pain / pâtisserie',
    'Confiseries / sucreries',
    'Friture (fritay)',
    'Épices pour cuisine',
    'Épices aromatiques (cannelle, anis, etc.)',
    'Produits agricoles',
    'Charcuterie / produits transformés',
    'Œufs et produits laitiers',
    'Animaux vivants',
    'Beurre d\'arachide / pâte spéciale',
  ],
  'Boissons': [
    'Jus naturels',
    'Jus préparés (blender)',
    'Boissons gazeuses',
    'Boissons alcoolisées',
    'Glace',
    'Friandises glacées',
    'Fresco / boissons maison',
  ],
  'Vêtements et friperie': [
    'Vêtements',
    'Sous-vêtements',
    'Friperie (pèpè)',
  ],
  'Chaussures et accessoires vestimentaires': [
    'Souliers',
    'Sandales',
    'Tennis',
    'Ceinture',
    'Chapeau',
    'Bijoux',
    'Valises / sacs',
  ],
  'Cosmétique / Beauté': [
    'Salon de coiffure',
    'Barber shop',
    'Manucure / nailtech',
    'Vente de cosmétiques',
    'Vente de parfums / produits beauté',
  ],
  'Téléphones / électronique': [
    'Vente de téléphones',
    'Réparation téléphone',
    'Vente d\'accessoires téléphone',
    'Vente d\'appareils électroniques',
    'Décodage cellulaire',
  ],
  'Quincaillerie / pièces / mécanique': [
    'Pièces / Auto Parts',
    'Garage / Mécanique',
    'Réfrigération / Climatisation',
    'Car Wash / Lavage',
    'Construction / Matériaux',
  ],
  'Boutique / articles divers': [
    'Boutique / Epicerie',
    'Shop / Store',
    'Articles divers',
    'Librairie',
    'Multi-service',
  ],
  'Produits importés / Saint-Domingue': [
    'Produits importés',
  ],
  'Botanica': [
    'Produits rituels',
    'Plantes médicinales',
    'Accessoires / décoration botanique',
  ],
  'Commerce général': [
    'Articles ménagers',
    'Ustensiles cuisine',
    'Toiles / textiles',
    'Stockage / Entrepôt',
  ],
  'Artisanat / métiers manuels': [
    'Tailleur / couture',
    'Cordonnier',
    'Ébéniste / menuiserie',
    'Maçon / construction',
    'Mécanicien',
    'Plombier / électricité',
    'Peintre',
    'Forgeron',
    'Carreleur',
  ],
  'Transport': [
    'Chauffeur moto',
    'Chauffeur taxi moto',
    'Chauffeur camion',
    'Transport marchandises',
  ],
  'Services professionnels': [
    'Comptable',
    'Informaticien',
    'Ingénieur',
    'Journaliste',
    'Avocat',
    'Professeur',
    'Infirmière',
    'Docteur',
  ],
  'Finance informelle': [
    'Borlette',
    'Change de monnaie (Cambiste)',
    'Transfert d\'argent',
  ],
};

export const CAPACITES_DISTRIBUTION = [
  'Grossiste',
  'Semi-grossiste',
  'Détaillant (vente au détail)',
] as const;

export const POINTS_DE_VENTE = [
  'Boutique / magasin',
  'Marchand de rue (stand fixe)',
  'Marchand ambulant',
] as const;
