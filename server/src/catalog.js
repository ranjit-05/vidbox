import { Media } from './models.js';

const titles = [
  { title: 'The Last Light', genre: 'Drama', year: 2025, duration: '1h 48m', price: 99, storageKey: 'videos/the-last-light.mp4', posterTone: 'violet', featured: true, description: 'On the edge of a quiet coastal town, a lighthouse keeper discovers that the brightest signal can come from the darkest night.' },
  { title: 'Wild Blue', genre: 'Documentary', year: 2024, duration: '52m', price: 49, storageKey: 'videos/wild-blue.mp4', posterTone: 'blue', description: 'A breathtaking journey through the hidden ecosystems thriving beneath the surface of our oceans.' },
  { title: 'A Little Further', genre: 'Adventure', year: 2025, duration: '1h 36m', price: 79, storageKey: 'videos/a-little-further.mp4', posterTone: 'gold', description: 'Two estranged siblings set out across the mountains to find a place neither remembers quite the same way.' },
  { title: 'After the Rain', genre: 'Romance', year: 2023, duration: '1h 42m', price: 59, storageKey: 'videos/after-the-rain.mp4', posterTone: 'rose', description: 'A chance meeting during a monsoon turns into a tender story about timing, home, and starting over.' },
  { title: 'Small Worlds', genre: 'Nature', year: 2024, duration: '48m', price: 39, storageKey: 'videos/small-worlds.mp4', posterTone: 'green', description: 'An intimate look at the astonishing lives unfolding in the smallest corners of the natural world.' },
  { title: 'The Long Way Home', genre: 'Drama', year: 2022, duration: '1h 54m', price: 69, storageKey: 'videos/long-way-home.mp4', posterTone: 'copper', description: 'A musician returns to the city she left behind and finds that the old neighborhood has a new song.' }
];

export async function seedCatalog() {
  if (await Media.countDocuments()) return;
  await Media.insertMany(titles);
  console.log(`Catalog ready: ${titles.length} films`);
}
