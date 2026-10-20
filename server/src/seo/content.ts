/* Contenu des pages publiques référencées (SEO). Tout est rendu côté serveur par render.ts :
   aucun JavaScript n'est nécessaire pour qu'un moteur de recherche, un aperçu de lien (WhatsApp,
   Discord, X…) ou un robot d'IA lise ces pages.

   RÈGLES ÉDITORIALES
   - Chaque fait daté ou chiffré vient d'une source citée en bas de page. Pas de source = pas d'affirmation.
   - Ce qu'on ne sait pas est écrit comme tel (voir /24-octobre).
   - Le site n'est affilié à aucun mouvement : c'est dit sur chaque page.
   - Mettre à jour `updated` (et la page) à chaque révision : il alimente <lastmod> du sitemap et dateModified. */

export interface Source {
  label: string;
  url: string;
}
export interface Section {
  h2: string;
  paras?: string[];
  bullets?: string[];
}
export interface Faq {
  q: string;
  a: string;
}
export interface SeoPage {
  path: string;
  /** <title> complet (≈ 60 caractères max pour ne pas être tronqué dans les résultats). */
  title: string;
  h1: string;
  /** meta description (≈ 155 caractères max). */
  description: string;
  kicker: string;
  lead: string;
  /** Fichier sous /assets/og/ (1200×630). */
  ogImage: string;
  published: string;
  updated: string;
  kind: 'mobilisation' | 'presse';
  hashtags: string[];
  sections: Section[];
  faq?: Faq[];
  sources?: Source[];
  related: string[];
  breadcrumb: string;
}

export const SITE_NAME = 'Ministère du vide';
export const SITE_TAGLINE = 'Le réseau social français et souverain';
export const SITE_DESCRIPTION =
  'Ministère du vide, le réseau social français et souverain : zéro publicité, fil chronologique, données hébergées en France. Rejoins la discussion, gratuitement.';
export const CONTACT_EMAIL = 'contact@wouaff.app';
export const REPO_URL = 'https://github.com/Wouaff/WouaffApp';
export const SITE_UPDATED = '2026-10-21';

const NOT_AFFILIATED =
  'Ministère du vide n’est affilié à aucun mouvement, syndicat ou parti et n’organise aucune manifestation : c’est un espace de discussion, soumis aux règles de la communauté (pas de harcèlement, pas d’appel à la violence, pas de publication de données personnelles d’autrui).';

const SRC = {
  cidj: {
    label: 'CIDJ — Les lycéens poursuivent la mobilisation',
    url: 'https://www.cidj.com/s-engager/les-lyceens-poursuivent-la-mobilisation',
  },
  publicSenat17: {
    label: 'Public Sénat — 17 octobre : le mouvement s’organise peu à peu, entre 250 et 1 000 actions prévues',
    url: 'https://www.publicsenat.fr/actualites/societe/17-octobre-le-mouvement-sorganise-peu-a-peu-entre-250-et-1000-actions-prevues-dans-toute-la-france',
  },
  afp17: {
    label: 'AFP, via Sud Radio — Journée test pour la convergence des colères entre jeunes et gilets jaunes',
    url: 'https://www.sudradio.fr/societe/journee-test-pour-la-convergence-des-coleres-entre-jeunes-et-gilets-jaunes',
  },
  bonbon: {
    label: 'Le Bonbon — Rassemblement gilets jaunes prévu en octobre 2026',
    url: 'https://lebonbon.fr/paris/news/rassemblement-gilets-jaunes-prevu-octobre-2026/',
  },
  ici24: {
    label: 'ICI — La coordination des gilets jaunes du 17 octobre annonce un « acte II » pour samedi 24 octobre',
    url: 'https://www.ici.fr/infos/societe/la-coordination-des-gilets-jaunes-du-17-octobre-annonce-un-acte-ii-pour-samedi-24-octobre-7782520',
  },
  ici24Toulouse: {
    label: 'ICI Occitanie — Un acte II de la mobilisation contre la vie chère est annoncé à Toulouse pour le samedi 24 octobre',
    url: 'https://www.ici.fr/occitanie/haute-garonne-31/toulouse/un-acte-ii-de-la-mobilisation-contre-la-vie-chere-est-annonce-a-toulouse-pour-le-samedi-24-octobre-1211002',
  },
  cnews20: {
    label: 'CNews — Lycéens, gilets jaunes, syndicats : après le 17 octobre, de nouvelles journées sous tension (20 octobre 2026)',
    url: 'https://www.cnews.fr/france/2026-10-20/lyceens-gilets-jaunes-syndicats-apres-le-17-octobre-ces-nouvelles-journees-sous',
  },
  macommune13: {
    label: 'Ma Commune — Mobilisation lycéenne : nouvel appel à manifester le mardi 13 octobre 2026 à Besançon',
    url: 'https://www.macommune.info/mobilisation-lyceenne-nouvel-appel-a-manifester-ce-mardi-13-octobre-2026-a-besancon/',
  },
  sortir13: {
    label: 'Sortir à Paris — Manifestation du mardi 13 octobre : le parcours prévu à Paris',
    url: 'https://www.sortiraparis.com/en/news/in-paris/articles/353729-protest-on-tuesday-october-13-here-are-the-details-of-the-route-planned-for-paris',
  },
} satisfies Record<string, Source>;

export const PAGES: SeoPage[] = [
  /* ───────────────────────────── Hub ───────────────────────────── */
  {
    path: '/mobilisations-en-france',
    title: 'Mobilisations en France : lycéens, gilets jaunes, 17 et 24 octobre',
    h1: 'Mobilisations en France : lycéens, gilets jaunes, 17 et 24 octobre 2026',
    description:
      'Chronologie sourcée des mobilisations de l’automne 2026 : mouvement lycéen, gilets jaunes, journée du 17 octobre, acte II du 24 octobre. Discute-en sans pub.',
    kicker: 'Dossier · Automne 2026',
    lead: 'Depuis le 21 septembre 2026, la France connaît une série de mobilisations : un mouvement lycéen parti de Créteil, une journée nationale contre la vie chère le 17 octobre qui a réuni lycéens, étudiants, salariés et gilets jaunes, puis un « acte II » annoncé pour le 24 octobre. Voici les repères, avec leurs sources.',
    ogImage: 'mobilisations.png',
    published: '2026-10-21',
    updated: '2026-10-21',
    kind: 'mobilisation',
    hashtags: ['mobilisation', 'giletsjaunes', 'mobilisationlyceenne', '17octobre', '24octobre', 'vieChere'],
    sections: [
      {
        h2: 'La chronologie',
        bullets: [
          '21 septembre — Blocage du lycée Saint-Exupéry à Créteil : le mouvement lycéen démarre, puis gagne l’Île-de-France, Marseille, Lille, Rennes et Strasbourg (CIDJ).',
          '29 septembre — L’Union syndicale lycéenne appelle à se joindre à la manifestation de la fonction publique ; plus de 400 établissements sont alors bloqués (CIDJ).',
          '30 septembre — Le ministre de l’Éducation nationale, Édouard Geffray, annonce une plateforme de concertation (CIDJ).',
          '6 octobre — « Acte II » du mouvement : manifestation commune des lycéens et des étudiants (CIDJ, Sortir à Paris).',
          '13 octobre — Nouvel appel à manifester, notamment à Paris et à Besançon (Sortir à Paris, Ma Commune).',
          '17 octobre — Journée contre la vie chère : 550 000 manifestants selon le ministre de l’Intérieur, 800 000 selon les organisateurs (AFP).',
          '24 octobre — « Acte II » annoncé par la coordination des gilets jaunes du 17 octobre (ICI).',
          '5 novembre — Journée intersyndicale de grève et de manifestation à laquelle la CGT appelle (AFP).',
        ],
      },
      {
        h2: 'Ce qui rapproche ces mobilisations',
        paras: [
          'Selon Public Sénat, le mouvement du 17 octobre est né sur les réseaux sociaux, d’abord contre la hausse des carburants, puis contre la vie chère en général, et s’est cristallisé autour des manifestations lycéennes. Les lycéens, eux, dénoncent le manque de personnels, les classes surchargées et des locaux vétustes.',
          'Le 17 octobre, l’AFP décrit un cortège hétérogène : gilets jaunes, lycéens et étudiants, salariés, militants pour le climat et antifascistes. La journée s’est aussi accompagnée de violences et de dégradations, dont le bilan officiel fait état de 1 200 interpellations.',
        ],
      },
      {
        h2: 'Comprendre chaque mobilisation',
        bullets: [
          'Mobilisation lycéenne : origine, revendications et dates (/mobilisation-lyceenne).',
          'Gilets jaunes en 2026 : le retour d’un mouvement né en 2018 (/gilets-jaunes).',
          'Manifestation du 17 octobre : chiffres, bilan et réactions (/17-octobre).',
          'Mobilisation du 24 octobre : ce qui est annoncé, ce qu’on ne sait pas encore (/24-octobre).',
        ],
      },
      {
        h2: 'En parler sur Ministère du vide',
        paras: [
          'Ministère du vide est un réseau social français : pas de publicité, un fil chronologique, des données hébergées en France. Les posts de 280 caractères, avec image ou vidéo, se rangent par hashtag : retrouve les discussions sous #mobilisation, #giletsjaunes, #mobilisationlyceenne, #17octobre et #24octobre.',
          NOT_AFFILIATED,
        ],
      },
    ],
    faq: [
      {
        q: 'Quelles sont les prochaines dates de mobilisation ?',
        a: 'D’après la presse, un « acte II » est annoncé pour le samedi 24 octobre 2026 par la coordination des gilets jaunes du 17 octobre, et la CGT appelle à une journée intersyndicale le 5 novembre. Vérifie toujours les appels auprès des organisateurs et des préfectures : les lieux et horaires changent.',
      },
      {
        q: 'Où trouver les manifestations près de chez moi ?',
        a: 'Pour le 17 octobre, une carte collaborative (mobilisation17octobre.fr) recensait plus de 1 000 actions au 16 octobre, selon Public Sénat. Les préfectures publient les parcours déclarés ou interdits.',
      },
      {
        q: 'Ministère du vide organise-t-il ces mobilisations ?',
        a: 'Non. C’est une plateforme de discussion, sans lien avec les organisateurs.',
      },
    ],
    sources: [SRC.cidj, SRC.publicSenat17, SRC.afp17, SRC.ici24, SRC.macommune13, SRC.sortir13],
    related: ['/mobilisation-lyceenne', '/gilets-jaunes', '/17-octobre', '/24-octobre'],
    breadcrumb: 'Mobilisations',
  },

  /* ───────────────────────── Mouvement lycéen ───────────────────────── */
  {
    path: '/mobilisation-lyceenne',
    title: 'Mobilisation lycéenne 2026 : dates, revendications, manifestations',
    h1: 'Mobilisation lycéenne 2026 : origine, revendications et dates',
    description:
      'Manifestation lycéenne 2026 : départ à Créteil le 21 septembre, revendications (profs, classes surchargées), actes des 29 septembre, 6 et 13 octobre. Sources.',
    kicker: 'Mouvement lycéen',
    lead: 'Le mouvement lycéen de 2026 a commencé le 21 septembre par le blocage du lycée Saint-Exupéry, à Créteil. En quelques jours, il a gagné d’autres lycées d’Île-de-France, puis Marseille, Lille, Rennes et Strasbourg. Voici ce qu’il demande et comment il s’est déroulé.',
    ogImage: 'lyceenne.png',
    published: '2026-10-21',
    updated: '2026-10-21',
    kind: 'mobilisation',
    hashtags: ['mobilisationlyceenne', 'lyceens', 'blocuslycee', 'manifestation', '17octobre'],
    sections: [
      {
        h2: 'Les revendications des lycéens',
        bullets: [
          'Le manque de personnels : professeurs, infirmiers, assistants sociaux.',
          'Des classes surchargées, avec plus de 35 élèves.',
          'Des locaux vétustes et des conditions d’études dégradées : un lycée prévu pour 1 200 élèves en accueillerait plus de 1 600.',
        ],
        paras: ['Ces revendications sont rapportées par le CIDJ (Centre d’information et de documentation jeunesse).'],
      },
      {
        h2: 'Les temps forts',
        bullets: [
          '21 septembre — Début du blocage au lycée Saint-Exupéry de Créteil.',
          '29 septembre — L’Union syndicale lycéenne (USL) appelle à se mobiliser lors de la manifestation de la fonction publique ; plus de 400 établissements sont alors bloqués.',
          '30 septembre — Le ministre de l’Éducation nationale, Édouard Geffray, annonce une plateforme de concertation et un événement national de restitution.',
          '6 octobre — « Acte II » : manifestation commune des lycéens et des étudiants, avec le soutien de l’Union étudiante.',
          '13 octobre — Nouvel appel à manifester, relayé notamment à Paris et à Besançon.',
          '17 octobre — Les lycéens rejoignent la journée nationale contre la vie chère, qui s’est construite, selon Public Sénat, à partir des manifestations lycéennes.',
        ],
      },
      {
        h2: 'Tensions et incidents',
        paras: [
          'Le CIDJ rapporte, d’après le ministre de l’Intérieur, une hausse des interpellations et environ 83 membres des forces de l’ordre blessés au cours des premières semaines. Des incidents ont aussi été signalés dans plusieurs villes, comme Besançon.',
        ],
      },
      {
        h2: 'Et maintenant ?',
        paras: [
          'Après le 17 octobre, la presse évoque de nouvelles journées de mobilisation, dont un « acte II » annoncé pour le 24 octobre (voir la page dédiée). Suis les appels de l’Union syndicale lycéenne et de l’Union étudiante, et vérifie les parcours auprès de la préfecture.',
          'Ministère du vide est ouvert à partir de 15 ans. Tu peux y partager ton vécu, poser tes questions et suivre les discussions sous #mobilisationlyceenne. ' +
            NOT_AFFILIATED,
        ],
      },
    ],
    faq: [
      {
        q: 'Pourquoi les lycéens manifestent-ils en 2026 ?',
        a: 'Pour dénoncer le manque de personnels, les classes à plus de 35 élèves et des locaux vétustes, d’après le CIDJ. Le mouvement a ensuite convergé avec la mobilisation contre la vie chère.',
      },
      {
        q: 'Quand a commencé le mouvement lycéen ?',
        a: 'Le 21 septembre 2026, avec le blocage du lycée Saint-Exupéry à Créteil.',
      },
      {
        q: 'Quelle est la prochaine manifestation lycéenne ?',
        a: 'Les appels évoluent vite. Les dernières dates confirmées par nos sources sont le 6 octobre (acte II), le 13 octobre et la journée du 17 octobre ; un « acte II » est annoncé pour le 24 octobre.',
      },
    ],
    sources: [SRC.cidj, SRC.publicSenat17, SRC.macommune13, SRC.sortir13, SRC.cnews20],
    related: ['/mobilisations-en-france', '/17-octobre', '/24-octobre', '/gilets-jaunes'],
    breadcrumb: 'Mobilisation lycéenne',
  },

  /* ───────────────────────────── Gilets jaunes ───────────────────────────── */
  {
    path: '/gilets-jaunes',
    title: 'Gilets jaunes 2026 : retour du mouvement, 17 octobre et acte II',
    h1: 'Gilets jaunes en 2026 : le retour d’un mouvement né en 2018',
    description:
      'Gilets jaunes 2026 : pourquoi le mouvement revient, ce qui s’est passé le 17 octobre, l’« acte II » annoncé le 24 octobre. Repères sourcés et discussion sans pub.',
    kicker: 'Gilets jaunes',
    lead: 'Né à l’automne 2018, le mouvement des gilets jaunes s’était fait connaître par ses ronds-points et ses samedis de manifestation. En octobre 2026, des gilets jaunes figurent parmi les déclarants des manifestations du 17 octobre, et une coordination annonce un « acte II » pour le 24.',
    ogImage: 'gilets-jaunes.png',
    published: '2026-10-21',
    updated: '2026-10-21',
    kind: 'mobilisation',
    hashtags: ['giletsjaunes', 'vieChere', '17octobre', '24octobre', 'acte2'],
    sections: [
      {
        h2: 'Pourquoi le mouvement revient en 2026',
        paras: [
          'Selon Public Sénat, les appels sont nés sur les réseaux sociaux pour protester contre la hausse des carburants, puis contre la vie chère en général. Pendant plus d’un mois, ils ont circulé en ligne sans être repris par les syndicats.',
          'Le Bonbon, qui relayait dès le 15 septembre une date de rassemblement alors non confirmée, évoque aussi la hausse du prix de l’essence et l’augmentation générale du coût de la vie, avec des salaires et des pensions qui stagnent.',
        ],
      },
      {
        h2: 'Le 17 octobre',
        paras: [
          'Des gilets jaunes ont déclaré une manifestation à Paris, à laquelle des syndicats se sont joints. Le préfet de police de Paris, Patrice Faure, a proposé un parcours Clichy–République pour le cortège gilets jaunes et syndicats (initialement Opéra–Bastille).',
          'D’après l’AFP, la journée a rassemblé 550 000 personnes selon le ministre de l’Intérieur et 800 000 selon les organisateurs, mais peu de blocages ont été observés, hormis quelques ronds-points. Détails et chiffres sur la page dédiée au 17 octobre.',
        ],
      },
      {
        h2: 'L’« acte II » du 24 octobre',
        paras: [
          'La coordination des gilets jaunes du 17 octobre a annoncé un « acte II » pour le samedi 24 octobre, selon ICI (ex-France Bleu). Un acte II a également été annoncé à Toulouse pour cette date.',
        ],
      },
      {
        h2: 'Des positions partagées',
        paras: [
          'Le retour du mouvement ne fait pas l’unanimité parmi ses anciennes figures : d’après Le Bonbon, certaines s’y opposent en craignant des victimes et une radicalisation de la société, tandis que des responsables politiques appellent au contraire à élargir la mobilisation (ronds-points, entreprises).',
          NOT_AFFILIATED,
        ],
      },
    ],
    faq: [
      {
        q: 'Les gilets jaunes manifestent-ils en 2026 ?',
        a: 'Oui : des gilets jaunes ont déclaré une manifestation à Paris le 17 octobre 2026, et une coordination annonce un « acte II » le 24 octobre.',
      },
      {
        q: 'Pourquoi manifestent-ils ?',
        a: 'Contre la hausse des carburants et la vie chère, selon Public Sénat.',
      },
      {
        q: 'Où discuter du mouvement ?',
        a: 'Sur Ministère du vide, sous #giletsjaunes, dans le respect des règles de la communauté.',
      },
    ],
    sources: [SRC.publicSenat17, SRC.afp17, SRC.bonbon, SRC.ici24, SRC.ici24Toulouse],
    related: ['/17-octobre', '/24-octobre', '/mobilisation-lyceenne', '/mobilisations-en-france'],
    breadcrumb: 'Gilets jaunes',
  },

  /* ───────────────────────────── 17 octobre ───────────────────────────── */
  {
    path: '/17-octobre',
    title: 'Manifestation du 17 octobre 2026 : bilan, chiffres et suite',
    h1: 'Manifestation du 17 octobre 2026 : bilan, chiffres et suite',
    description:
      '17 octobre 2026 : 550 000 manifestants selon l’Intérieur, 800 000 selon les organisateurs, 1 200 interpellations. Chiffres, villes, réactions et prochaines dates.',
    kicker: 'Journée du 17 octobre',
    lead: 'Le samedi 17 octobre 2026, une journée de mobilisation contre la vie chère a eu lieu à Paris et dans de nombreuses villes. Elle a réuni des gilets jaunes, des lycéens et étudiants, des salariés, des militants pour le climat et des antifascistes. Voici les chiffres et les faits, avec leurs sources.',
    ogImage: '17-octobre.png',
    published: '2026-10-21',
    updated: '2026-10-21',
    kind: 'mobilisation',
    hashtags: ['17octobre', 'giletsjaunes', 'mobilisationlyceenne', 'vieChere', 'manifestation'],
    sections: [
      {
        h2: 'Avant le 17 octobre',
        paras: [
          'Public Sénat rapporte que le mouvement s’est organisé peu à peu : entre 200 et 300 actions prévues selon une source proche du ministère de l’Intérieur citée par franceinfo, plus de 1 000 recensées le 16 octobre sur la carte collaborative mobilisation17octobre.fr. Les autorités attendaient entre 20 000 et 40 000 manifestants à Paris.',
          'Le préfet de police de Paris a interdit le trajet déclaré par l’AG Interfac Île-de-France (République–Concorde). Le ministre de l’Intérieur, Laurent Nuñez, avait réuni les responsables de la police, de la gendarmerie et du renseignement : les débordements devaient être réprimés, les manifestations pacifiques encadrées.',
        ],
      },
      {
        h2: 'Les chiffres de la journée',
        bullets: [
          'France entière : 550 000 manifestants selon le ministre de l’Intérieur, 800 000 selon les organisateurs.',
          'Paris : 110 000 manifestants selon les autorités.',
          'Lyon et Nantes : 20 000 chacune. Strasbourg : 15 000. Rennes : 12 000. La Rochelle : 7 000 (autorités).',
        ],
        paras: ['Source : AFP, via Sud Radio. Les écarts entre chiffres officiels et chiffres des organisateurs sont habituels : ils reposent sur des méthodes de comptage différentes.'],
      },
      {
        h2: 'Violences et bilan officiel',
        paras: [
          'Selon l’AFP, la journée s’est terminée par des pillages, des dégradations et des incendies de véhicules, notamment à Paris, Lyon, Lille, Rennes, Bordeaux et Marseille. Le Premier ministre, Sébastien Lecornu, a fait état de 1 200 interpellations et de 150 policiers et gendarmes blessés.',
          'Emmanuel Macron a promis que les auteurs de violences seraient « poursuivis et punis » ; le ministre de la Justice, Gérald Darmanin, a demandé une réponse judiciaire « extrêmement ferme ».',
        ],
      },
      {
        h2: 'Et après ?',
        bullets: [
          '24 octobre — « Acte II » annoncé par la coordination des gilets jaunes du 17 octobre (ICI).',
          '5 novembre — La CGT appelle à poursuivre la mobilisation lors de la journée intersyndicale de grève et de manifestation (AFP).',
        ],
      },
      {
        h2: 'En discuter',
        paras: ['Partage ton témoignage et suis les échanges sous #17octobre. ' + NOT_AFFILIATED],
      },
    ],
    faq: [
      {
        q: 'Combien de personnes ont manifesté le 17 octobre 2026 ?',
        a: '550 000 selon le ministre de l’Intérieur, 800 000 selon les organisateurs (AFP).',
      },
      {
        q: 'Quel est le bilan des interpellations ?',
        a: '1 200 interpellations et 150 policiers et gendarmes blessés, d’après le Premier ministre Sébastien Lecornu (AFP).',
      },
      {
        q: 'Y a-t-il une nouvelle mobilisation ?',
        a: 'Un « acte II » est annoncé pour le samedi 24 octobre 2026, et une journée intersyndicale est appelée le 5 novembre.',
      },
    ],
    sources: [SRC.afp17, SRC.publicSenat17, SRC.ici24],
    related: ['/24-octobre', '/gilets-jaunes', '/mobilisation-lyceenne', '/mobilisations-en-france'],
    breadcrumb: '17 octobre',
  },

  /* ───────────────────────────── 24 octobre ───────────────────────────── */
  {
    path: '/24-octobre',
    title: 'Mobilisation du 24 octobre 2026 : acte II, ce que l’on sait',
    h1: 'Mobilisation du 24 octobre 2026 : l’« acte II », ce que l’on sait',
    description:
      '24 octobre 2026 : la coordination des gilets jaunes du 17 octobre annonce un « acte II ». Ce qui est confirmé, ce qui ne l’est pas, repères pratiques et suite.',
    kicker: 'Samedi 24 octobre',
    lead: 'Une semaine après la journée du 17 octobre, un « acte II » est annoncé pour le samedi 24 octobre 2026. Cette page distingue ce qui est annoncé de ce qui reste à confirmer, et sera mise à jour.',
    ogImage: '24-octobre.png',
    published: '2026-10-21',
    updated: '2026-10-21',
    kind: 'mobilisation',
    hashtags: ['24octobre', 'acte2', 'giletsjaunes', 'vieChere', 'mobilisation'],
    sections: [
      {
        h2: 'Ce qui est annoncé',
        bullets: [
          'La coordination des gilets jaunes du 17 octobre annonce un « acte II » pour le samedi 24 octobre (ICI).',
          'Un acte II de la mobilisation contre la vie chère est annoncé à Toulouse pour cette même date (ICI Occitanie).',
          'La presse évoque, après le 17 octobre, de nouvelles journées sous tension impliquant lycéens, gilets jaunes et syndicats (CNews, 20 octobre).',
        ],
      },
      {
        h2: 'Ce que l’on ne sait pas encore',
        paras: [
          'À la date de cette mise à jour (21 octobre), nous n’avons pas pu confirmer, pour l’ensemble du territoire, les villes, les horaires, les parcours ni l’ampleur attendue. Nous ne les inventons pas : consulte les appels des organisateurs et les arrêtés de ta préfecture.',
        ],
      },
      {
        h2: 'Repères pratiques',
        bullets: [
          'Une manifestation sur la voie publique est soumise à déclaration préalable auprès de la préfecture, qui peut l’interdire ou imposer un autre parcours, comme à Paris le 17 octobre.',
          'Les préfectures publient les informations de circulation et de sécurité le jour même.',
          'Prévois de quoi t’hydrater, un téléphone chargé et une façon de rejoindre tes proches.',
        ],
      },
      {
        h2: 'Ensuite',
        paras: [
          'Le 5 novembre, la CGT appelle à une journée intersyndicale de grève et de manifestation interprofessionnelle (AFP).',
          'Raconte ta journée et suis les échanges sous #24octobre. ' + NOT_AFFILIATED,
        ],
      },
    ],
    faq: [
      {
        q: 'Y a-t-il une manifestation le 24 octobre 2026 ?',
        a: 'Un « acte II » est annoncé pour le samedi 24 octobre par la coordination des gilets jaunes du 17 octobre, notamment à Toulouse. Les détails (lieux, horaires) sont à vérifier auprès des organisateurs et des préfectures.',
      },
      {
        q: 'Où a lieu la manifestation du 24 octobre ?',
        a: 'Toulouse est cité par ICI Occitanie. Pour les autres villes, nous n’avons pas de confirmation à ce stade.',
      },
      {
        q: 'Et le 5 novembre ?',
        a: 'La CGT appelle à une journée intersyndicale de grève et de manifestation interprofessionnelle (AFP).',
      },
    ],
    sources: [SRC.ici24, SRC.ici24Toulouse, SRC.cnews20, SRC.afp17],
    related: ['/17-octobre', '/gilets-jaunes', '/mobilisation-lyceenne', '/mobilisations-en-france'],
    breadcrumb: '24 octobre',
  },

  /* ───────────────────────────── Presse ───────────────────────────── */
  {
    path: '/espace-presse',
    title: 'Espace presse : Ministère du vide, réseau social français sans pub',
    h1: 'Espace presse — Ministère du vide',
    description:
      'Ministère du vide : réseau social français et souverain, sans publicité, données hébergées en France, code ouvert. Fiche d’identité, angles et contact presse.',
    kicker: 'Presse',
    lead: 'Ministère du vide est un réseau social français, sans publicité, dont les données sont hébergées en France. Cette page rassemble ce dont une rédaction a besoin : faits vérifiables, angles possibles et contact.',
    ogImage: 'presse.png',
    published: '2026-10-21',
    updated: '2026-10-21',
    kind: 'presse',
    hashtags: ['ministeredutweet', 'reseausocial', 'souverainete'],
    sections: [
      {
        h2: 'En bref',
        bullets: [
          'Un réseau social français : posts de 280 caractères avec image ou vidéo, réponses, reposts, abonnements, notifications, recherche, hashtags et mentions.',
          'Zéro publicité, aucune revente de données, hébergement en France, soumis au RGPD.',
          'Un fil « Pour toi » chronologique et un fil « Abonnements ».',
          'Code source ouvert, application web installable (PWA) et application de bureau.',
          'Modération avec signalement par catégorie, sanctions graduées et décisions notifiées avec leur motif, contestables par e-mail.',
          'Export de ses données et suppression définitive du compte depuis les paramètres.',
          'Réservé aux 15 ans et plus ; la date de naissance n’est pas conservée.',
        ],
      },
      {
        h2: 'Angles possibles',
        bullets: [
          'Souveraineté numérique : une alternative française aux grandes plateformes, hébergée en France.',
          'Débat public sans publicité ni fil algorithmique pendant les mobilisations de l’automne 2026.',
          'Modération transparente : chaque décision est motivée et contestable.',
          'Un projet open source porté par une petite équipe.',
        ],
      },
      {
        h2: 'Fondateurs',
        paras: ['@imbiston (fondateur et développeur) et @youtsuhodev (fondateur et lead développeur).'],
      },
      {
        h2: 'Contact et ressources',
        bullets: [
          'Contact presse : ' + CONTACT_EMAIL,
          'Code source : ' + REPO_URL,
          'Logo : /assets/logo/logo.png',
          'Dossier sur les mobilisations en cours : /mobilisations-en-france',
        ],
        paras: ['Nous répondons aux demandes d’interview, de précisions techniques et de visuels.'],
      },
    ],
    faq: [
      {
        q: 'Ministère du vide est-il gratuit ?',
        a: 'Oui. Il n’affiche aucune publicité et ne revend aucune donnée.',
      },
      {
        q: 'Où sont hébergées les données ?',
        a: 'En France, conformément au RGPD.',
      },
    ],
    related: ['/mobilisations-en-france', '/mobilisation-lyceenne', '/gilets-jaunes'],
    breadcrumb: 'Presse',
  },
];

export const PAGE_BY_PATH = new Map(PAGES.map((p) => [p.path, p]));

/* Pages « légales » de la SPA, indexables (contenu statique dans LegalPage.tsx). */
export const LEGAL_PAGES: Record<string, string> = {
  conditions: "Conditions d'utilisation",
  confidentialite: 'Politique de confidentialité',
  regles: 'Règles de la communauté',
  'a-propos': 'À propos du Ministère du vide',
};
