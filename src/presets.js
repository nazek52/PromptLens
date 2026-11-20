/** Editable starting points: each choice is visible and replaceable. */
export const PRESETS = [
  {
    id: 'anime', label: 'Аниме-персонаж', description: 'Характер, внешность и читаемый силуэт',
    brief: {
      idea: 'Original anime character for a profile illustration',
      subject: 'A young adult explorer with short silver hair, amber eyes, and a dark blue travel jacket',
      style: '2D anime illustration, clean line art, cel shading',
      composition: 'Waist-up, three-quarter view, looking toward the viewer; leave space above the head',
      lighting: 'Soft warm light from the left', palette: 'Midnight blue, silver, warm amber accents',
      background: 'Simple pale blue background', details: 'Small compass pendant, calm and curious expression',
      avoid: 'Extra characters, cropped head, visible lettering', aspectRatio: '2:3', purpose: 'Character profile', text: '',
    },
  },
  {
    id: 'product', label: 'Фото продукта', description: 'Материалы, свет и аккуратная постановка',
    brief: {
      idea: 'Studio product photograph for a shop', subject: 'A matte ceramic coffee cup with a curved handle',
      style: 'Photorealistic studio product photography', composition: 'Three-quarter view at cup height, centered with breathing room',
      lighting: 'Large softbox from the upper left, subtle contact shadow', palette: 'Cream, warm beige, muted terracotta',
      background: 'Plain warm beige studio sweep', details: 'Clearly visible ceramic texture and handle',
      avoid: 'Logos, lettering, extra objects', aspectRatio: '1:1', purpose: 'Product listing', text: '',
    },
  },
  {
    id: 'portrait', label: 'Портрет', description: 'Ракурс, выражение и настроение',
    brief: {
      idea: 'Editorial portrait', subject: 'An adult musician holding an acoustic guitar',
      style: 'Natural documentary photography', composition: 'Waist-up portrait at eye level, subject slightly right of center',
      lighting: 'Soft afternoon window light', palette: 'Warm browns and muted greens',
      background: 'Quiet rehearsal room, gently out of focus', details: 'Relaxed expression, hands resting naturally on the guitar',
      avoid: 'Lettering and exaggerated skin smoothing', aspectRatio: '2:3', purpose: 'Artist introduction', text: '',
    },
  },
  {
    id: 'scene', label: 'Мир и окружение', description: 'Масштаб, глубина и атмосфера',
    brief: {
      idea: 'A peaceful floating island at sunrise', subject: 'A small stone observatory on an island above the clouds',
      style: 'Painterly fantasy concept art', composition: 'Wide establishing shot; foreground clouds, island in the middle, distant mountains',
      lighting: 'Low golden sunrise with cool shadows', palette: 'Soft peach, sky blue, moss green',
      background: 'Layered clouds and distant mountain silhouettes', details: 'A winding path leads toward the observatory',
      avoid: 'People, lettering, modern skyscrapers', aspectRatio: '3:2', purpose: 'Environment concept', text: '',
    },
  },
  {
    id: 'logo', label: 'Логотип', description: 'Простая форма и заданная надпись',
    brief: {
      idea: 'A compact emblem for an independent tea brand', subject: 'A single stylized tea leaf inside a circle',
      style: 'Flat, minimal geometric graphic with crisp edges', composition: 'Centered emblem, brand name below, generous clear space',
      lighting: '', palette: 'Dark green and cream', background: 'Solid cream background',
      details: 'Simple silhouette that remains readable at small sizes', avoid: 'Gradients, 3D effects, mockups, extra text',
      aspectRatio: '1:1', purpose: 'Logo concept; final vector artwork will need manual preparation', text: 'LEAF',
    },
  },
];
