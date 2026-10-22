import { Navigate, useParams } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../hooks/useAuth';

// Adresse de contact affichée dans les pages légales (à modifier ici uniquement).
const CONTACT_EMAIL = 'contact@wouaff.app';

const PAGES: Record<string, { title: string; body: string[] }> = {
  conditions: {
    title: "Conditions d'utilisation",
    body: [
      "Le Ministère du vide est un réseau social français. En créant un compte, tu t'engages à respecter la loi, les règles de la communauté et les autres membres.",
      'Il faut avoir au moins 15 ans pour créer un compte. Nous ne conservons pas ta date de naissance, seulement la confirmation que tu as l’âge requis.',
      'Tu restes propriétaire de ce que tu publies. En le publiant, tu nous autorises seulement à l’afficher aux personnes à qui il est destiné et à le conserver le temps nécessaire au fonctionnement du service.',
      'Par défaut, tes posts ne sont visibles qu’une fois connecté. Tu peux choisir, post par post, de rendre un post public (réservé aux personnes de 18 ans et plus) : il est alors visible sans connexion et peut être référencé par les moteurs de recherche. Tu peux le repasser en privé ou le supprimer à tout moment.',
      'Nous pouvons retirer un contenu, suspendre ou bannir un compte qui enfreint les règles ou la loi. Chaque décision est notifiée avec son motif, et tu peux la contester en écrivant à ' +
        CONTACT_EMAIL +
        '. Tu peux supprimer ton compte à tout moment depuis les paramètres.',
      'Le service est fourni en l’état, sans garantie de disponibilité continue.',
    ],
  },
  confidentialite: {
    title: 'Politique de confidentialité',
    body: [
      'Les données du Ministère du vide sont hébergées en France et soumises au RGPD.',
      'Nous collectons uniquement ce qui est nécessaire : pseudo, mot de passe (stocké sous forme chiffrée irréversible), contenus que tu publies, abonnements, notifications et sessions de connexion.',
      'Nous ne revendons aucune donnée et n’affichons aucune publicité.',
      'Liens sociaux : un lien YouTube, Vimeo, Spotify, SoundCloud, TikTok, X, Instagram ou Twitch peut s’afficher dans un post, mais seulement après ton clic. Rien n’est chargé chez ces services avant, et ton adresse IP ne leur est transmise qu’à ce moment-là.',
      'Compteur de vues : pour compter chaque personne une seule fois par post, nous conservons une empreinte irréversible de ton adresse IP (jamais l’adresse elle-même), associée au post vu et à la date de la première vue. Elle ne sert qu’à ce compteur et disparaît avec le post.',
      'Posts publics : si tu choisis de rendre un post public, ce post, ton pseudo et ton nom affiché sont visibles sans connexion et peuvent être référencés par des moteurs de recherche. Nous les prévenons quand tu le retires ou le supprimes, mais ils peuvent conserver une copie un certain temps, et des tiers peuvent avoir copié le contenu : réfléchis avant de publier. Les autres posts ne sont jamais exposés.',
      'Tes droits : tu peux exporter toutes tes données et supprimer définitivement ton compte depuis Paramètres → Confidentialité. Pour toute demande : ' +
        CONTACT_EMAIL +
        '.',
    ],
  },
  regles: {
    title: 'Règles de la communauté',
    body: [
      'Respecte les autres : pas de harcèlement, de menaces, de haine ni de discrimination.',
      'Pas de contenu illégal, de spam, d’usurpation d’identité ni de publication de données personnelles d’autrui.',
      'Utilise le signalement (menu « … » d’un post) pour alerter l’équipe : choisis une catégorie, un modérateur examine le signalement et tu es informé de la suite donnée. Utilise le blocage pour ne plus voir un compte.',
      'Sanctions possibles selon la gravité : avertissement, suppression du contenu, suspension temporaire (lecture seule), bannissement.',
    ],
  },
  'a-propos': {
    title: 'À propos du Ministère du vide',
    body: [
      'Le Ministère du vide est un réseau social français et souverain : pas de pub, pas de revente de données, hébergement en France.',
      `Contact : ${CONTACT_EMAIL}.`,
    ],
  },
};

export default function LegalPage() {
  const { slug = '' } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const page = PAGES[slug];
  if (!page) return <Navigate to="/" replace />;

  return (
    <div className="min-h-dvh bg-[var(--bg-primary)] flex justify-center">
      <main className="w-full max-w-[680px] bg-[var(--bg-secondary)] border-x border-[var(--border-color)]">
        <PageHeader title={page.title} back={user ? '/' : '/auth'} />
        <div className="p-6 space-y-4 text-[var(--text-primary)] leading-relaxed">
          {page.body.map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      </main>
    </div>
  );
}
