// ============= ULTIMATE DERIVATIVE DETECTION ENGINE v2 =============
// Multi-layered detection with 12 different methods for maximum accuracy

export interface DetectionResult {
  matched: boolean;
  method: string;
  confidence: number;
  details?: string;
}

// ============= UTILITIES =============

// Normalize text: lowercase, remove special chars
function normalize(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Remove repeated characters: "peeeepe" → "pepe"
function derepeat(str: string): string {
  return str.replace(/(.)\1{2,}/g, '$1$1');
}

// Leet speak conversion: "p3p3" → "pepe", "d0g3" → "doge"
function deleet(str: string): string {
  const leetMap: Record<string, string> = {
    '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's',
    '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i'
  };
  return str.split('').map(c => leetMap[c] || c).join('');
}

// Split camelCase/compound: "BabyPepeKing" → ["baby", "pepe", "king"]
function splitCompound(str: string): string[] {
  return str
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[\s\-_]+/)
    .filter(w => w.length > 0);
}

// Generate n-grams
function ngrams(str: string, n: number): string[] {
  const result: string[] = [];
  const s = normalize(str);
  for (let i = 0; i <= s.length - n; i++) {
    result.push(s.slice(i, i + n));
  }
  return result;
}

// Levenshtein distance
function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      matrix[i][j] = b[i-1] === a[j-1] 
        ? matrix[i-1][j-1]
        : Math.min(matrix[i-1][j-1] + 1, matrix[i][j-1] + 1, matrix[i-1][j] + 1);
    }
  }
  return matrix[b.length][a.length];
}

// ============= LAYER 1: DIRECT CONTAINMENT =============
export function directMatch(
  runnerName: string, 
  runnerSymbol: string, 
  tokenName: string, 
  tokenSymbol: string
): DetectionResult {
  const rSym = normalize(runnerSymbol);
  const tSym = normalize(tokenSymbol);
  const tName = normalize(tokenName);
  
  if (rSym === tSym) return { matched: false, method: 'direct', confidence: 0 };
  
  if (rSym.length >= 3) {
    if (tSym.includes(rSym)) {
      return { matched: true, method: 'direct', confidence: 98, details: `${tokenSymbol} contains ${runnerSymbol}` };
    }
    if (tName.includes(rSym)) {
      return { matched: true, method: 'direct', confidence: 95, details: `"${tokenName}" contains ${runnerSymbol}` };
    }
  }
  
  return { matched: false, method: 'direct', confidence: 0 };
}

// ============= LAYER 2: PATTERN MATCHING (prefix/suffix) =============
const PREFIXES = [
  'baby', 'mini', 'micro', 'nano', 'mega', 'giga', 'ultra', 'super', 'hyper',
  'king', 'queen', 'prince', 'princess', 'lord', 'lady', 'sir', 'mr', 'mrs', 'dr', 'chief',
  'son', 'daughter', 'wife', 'mom', 'dad', 'mother', 'father', 'bro', 'sis',
  'little', 'big', 'fat', 'slim', 'rich', 'poor', 'happy', 'sad', 'angry', 'mad',
  'dark', 'evil', 'good', 'holy', 'saint', 'demon', 'god', 'devil',
  'new', 'old', 'og', 'real', 'true', 'original', 'fake', 'based', 'rare',
  'meta', 'sol', 'eth', 'base', 'on', 'the', 'el', 'la', 'le'
];

const SUFFIXES = [
  '2', '20', '2024', '2025', '2026', '3', 'ii', 'iii', 'iv', 'v', 'jr', 'sr',
  'pro', 'max', 'plus', 'lite', 'ultra', 'prime', 'gold', 'diamond', 'platinum',
  'inu', 'wif', 'hat', 'coin', 'token', 'meme', 'fi', 'swap', 'dex',
  'ai', 'bot', 'agent', 'gpt', 'x', 'z',
  'army', 'gang', 'squad', 'club', 'cult', 'maxi', 'fam', 'bros',
  'moon', 'pump', 'run', 'runner', 'chain', 'verse', 'world', 'land',
  'classic', 'remix', 'reborn', 'returns', 'strikes', 'rising', 'saga',
  'sol', 'eth', 'base', 'on', 'onchain'
];

export function patternMatch(
  runnerSymbol: string,
  tokenName: string,
  tokenSymbol: string
): DetectionResult {
  const rSym = normalize(runnerSymbol);
  const tSym = normalize(tokenSymbol);
  const tName = normalize(tokenName);
  
  if (rSym === tSym || rSym.length < 2) return { matched: false, method: 'pattern', confidence: 0 };
  
  for (const prefix of PREFIXES) {
    if (tSym === prefix + rSym || tName === prefix + rSym) {
      return { matched: true, method: 'pattern', confidence: 94, details: `${prefix}+${runnerSymbol}` };
    }
  }
  
  for (const suffix of SUFFIXES) {
    if (tSym === rSym + suffix || tName === rSym + suffix) {
      return { matched: true, method: 'pattern', confidence: 94, details: `${runnerSymbol}+${suffix}` };
    }
  }
  
  return { matched: false, method: 'pattern', confidence: 0 };
}

// ============= LAYER 3: WORD BOUNDARY =============
export function wordBoundaryMatch(
  runnerSymbol: string,
  tokenName: string,
  tokenSymbol: string
): DetectionResult {
  const rSym = normalize(runnerSymbol);
  const tSym = normalize(tokenSymbol);
  const tName = normalize(tokenName);
  
  if (rSym === tSym || rSym.length < 2) return { matched: false, method: 'boundary', confidence: 0 };
  
  // Check compound words
  const tokenWords = splitCompound(tokenName + ' ' + tokenSymbol);
  if (tokenWords.includes(rSym)) {
    return { matched: true, method: 'boundary', confidence: 92, details: `contains word "${runnerSymbol}"` };
  }
  
  const startsWithRunner = tSym.startsWith(rSym) || tName.startsWith(rSym);
  const endsWithRunner = tSym.endsWith(rSym) || tName.endsWith(rSym);
  
  if (startsWithRunner || endsWithRunner) {
    return { matched: true, method: 'boundary', confidence: 90, details: `${startsWithRunner ? 'starts' : 'ends'} with ${runnerSymbol}` };
  }
  
  return { matched: false, method: 'boundary', confidence: 0 };
}

// ============= LAYER 4: MISSPELLING DETECTION =============
const LETTER_SWAPS: [string, string][] = [
  ['o', '0'], ['i', '1'], ['e', '3'], ['a', '4'], ['s', '5'], ['b', '8'],
  ['o', 'u'], ['i', 'e'], ['a', 'e'], ['c', 'k'], ['s', 'z'], ['y', 'i'],
  ['ph', 'f'], ['ck', 'k'], ['ee', 'i'], ['oo', 'u'], ['er', 'a'], ['or', 'a'],
  ['x', 'ks'], ['qu', 'kw'], ['tion', 'shun'], ['ght', 't']
];

export function misspellingMatch(
  runnerSymbol: string,
  tokenSymbol: string
): DetectionResult {
  const rSym = normalize(runnerSymbol);
  const tSym = normalize(tokenSymbol);
  
  if (rSym === tSym || rSym.length < 3) return { matched: false, method: 'misspelling', confidence: 0 };
  if (Math.abs(rSym.length - tSym.length) > 2) return { matched: false, method: 'misspelling', confidence: 0 };
  
  // Try letter swaps
  for (const [a, b] of LETTER_SWAPS) {
    const swapped1 = rSym.replace(new RegExp(a, 'g'), b);
    const swapped2 = rSym.replace(new RegExp(b, 'g'), a);
    
    if (swapped1 === tSym || swapped2 === tSym) {
      return { matched: true, method: 'misspelling', confidence: 90, details: `${a}↔${b} swap` };
    }
  }
  
  // Levenshtein for small differences
  const dist = levenshtein(rSym, tSym);
  if (dist === 1 && rSym.length >= 3) {
    return { matched: true, method: 'misspelling', confidence: 88, details: '1 char difference' };
  }
  if (dist === 2 && rSym.length >= 5) {
    return { matched: true, method: 'misspelling', confidence: 78, details: '2 char difference' };
  }
  
  return { matched: false, method: 'misspelling', confidence: 0 };
}

// ============= LAYER 5: PHONETIC (SOUNDEX + METAPHONE) =============
function soundex(str: string): string {
  const s = str.toUpperCase().replace(/[^A-Z]/g, '');
  if (!s) return '';
  
  const codes: Record<string, string> = {
    B: '1', F: '1', P: '1', V: '1',
    C: '2', G: '2', J: '2', K: '2', Q: '2', S: '2', X: '2', Z: '2',
    D: '3', T: '3', L: '4', M: '5', N: '5', R: '6'
  };
  
  let result = s[0];
  let prevCode = codes[s[0]] || '';
  
  for (let i = 1; i < s.length && result.length < 4; i++) {
    const code = codes[s[i]] || '';
    if (code && code !== prevCode) result += code;
    prevCode = code || prevCode;
  }
  
  return (result + '000').slice(0, 4);
}

// Simple Metaphone implementation
function metaphone(str: string): string {
  let s = str.toUpperCase().replace(/[^A-Z]/g, '');
  if (!s) return '';
  
  // Simplified metaphone rules
  s = s.replace(/^KN|^GN|^PN|^AE|^WR/, s[1]);
  s = s.replace(/MB$/, 'M');
  s = s.replace(/X/, 'KS');
  s = s.replace(/PH/g, 'F');
  s = s.replace(/CK/g, 'K');
  s = s.replace(/SCH/g, 'SK');
  s = s.replace(/GH/g, '');
  s = s.replace(/[AEIOU]/g, '');
  s = s.replace(/(.)\1+/g, '$1');
  
  return s.slice(0, 4);
}

export function phoneticMatch(
  runnerName: string,
  runnerSymbol: string,
  tokenName: string,
  tokenSymbol: string
): DetectionResult {
  const rSym = runnerSymbol.replace(/[^a-zA-Z]/g, '');
  const tSym = tokenSymbol.replace(/[^a-zA-Z]/g, '');
  
  if (rSym.length < 3 || tSym.length < 3) return { matched: false, method: 'phonetic', confidence: 0 };
  if (rSym.toLowerCase() === tSym.toLowerCase()) return { matched: false, method: 'phonetic', confidence: 0 };
  
  // Check soundex
  if (rSym[0].toLowerCase() === tSym[0].toLowerCase()) {
    if (soundex(rSym) === soundex(tSym)) {
      return { matched: true, method: 'phonetic', confidence: 85, details: `soundex match` };
    }
    // Check metaphone
    if (metaphone(rSym) === metaphone(tSym)) {
      return { matched: true, method: 'phonetic', confidence: 83, details: `metaphone match` };
    }
  }
  
  // Check first word of names
  const rNameWord = runnerName.split(/\s+/)[0].replace(/[^a-zA-Z]/g, '');
  const tNameWord = tokenName.split(/\s+/)[0].replace(/[^a-zA-Z]/g, '');
  
  if (rNameWord.length >= 4 && tNameWord.length >= 4) {
    if (rNameWord[0].toLowerCase() === tNameWord[0].toLowerCase()) {
      if (soundex(rNameWord) === soundex(tNameWord) || metaphone(rNameWord) === metaphone(tNameWord)) {
        return { matched: true, method: 'phonetic', confidence: 80, details: `name sounds similar` };
      }
    }
  }
  
  return { matched: false, method: 'phonetic', confidence: 0 };
}

// ============= LAYER 6: LEET SPEAK / REPEATED CHARS =============
export function leetMatch(
  runnerSymbol: string,
  tokenSymbol: string
): DetectionResult {
  const rSym = normalize(runnerSymbol);
  let tSym = tokenSymbol.toLowerCase();
  
  if (rSym === normalize(tSym) || rSym.length < 3) return { matched: false, method: 'leet', confidence: 0 };
  
  // Convert leet speak
  const deleeted = normalize(deleet(tSym));
  if (deleeted === rSym) {
    return { matched: true, method: 'leet', confidence: 88, details: 'leet speak conversion' };
  }
  
  // Remove repeated characters
  const derepeated = normalize(derepeat(tSym));
  if (derepeated === rSym) {
    return { matched: true, method: 'leet', confidence: 86, details: 'repeated chars removed' };
  }
  
  // Combine both
  const both = normalize(derepeat(deleet(tSym)));
  if (both === rSym) {
    return { matched: true, method: 'leet', confidence: 84, details: 'leet + repeated chars' };
  }
  
  return { matched: false, method: 'leet', confidence: 0 };
}

// ============= LAYER 7: N-GRAM OVERLAP =============
export function ngramMatch(
  runnerSymbol: string,
  tokenSymbol: string
): DetectionResult {
  const rSym = normalize(runnerSymbol);
  const tSym = normalize(tokenSymbol);
  
  if (rSym === tSym || rSym.length < 4 || tSym.length < 4) {
    return { matched: false, method: 'ngram', confidence: 0 };
  }
  
  // Use trigrams
  const rGrams = new Set(ngrams(rSym, 3));
  const tGrams = new Set(ngrams(tSym, 3));
  
  if (rGrams.size === 0 || tGrams.size === 0) {
    return { matched: false, method: 'ngram', confidence: 0 };
  }
  
  let overlap = 0;
  rGrams.forEach(g => {
    if (tGrams.has(g)) overlap++;
  });
  
  const similarity = overlap / Math.max(rGrams.size, tGrams.size);
  
  if (similarity >= 0.7) {
    return { matched: true, method: 'ngram', confidence: Math.round(75 + similarity * 20), details: `${Math.round(similarity * 100)}% trigram overlap` };
  }
  
  return { matched: false, method: 'ngram', confidence: 0 };
}

// ============= LAYER 8: THEME/ENTITY MATCHING =============
const THEME_ENTITIES: Record<string, string[]> = {
  // Frogs
  'pepe': ['pepe', 'pep', 'frog', 'kek', 'rare', 'smug', 'feels', 'apu', 'peepo', 'pepega', 'ribbit', 'toad', 'hoppy', 'froggy', 'kekius', 'grok', 'groyper', 'honk', 'clown', 'honkler'],
  // Dogs  
  'doge': ['doge', 'shiba', 'shib', 'inu', 'kabosu', 'cheems', 'bonk', 'doggy', 'shibu', 'woof', 'puppy', 'pupper', 'doggo', 'floki', 'akita', 'corgi', 'husky', 'dingo', 'hachiko', 'snoop'],
  // Cats
  'cat': ['cat', 'kitty', 'kitten', 'meow', 'popcat', 'mog', 'michi', 'nyan', 'catto', 'gato', 'pussy', 'feline', 'tabby', 'whiskers', 'paws', 'grumpy', 'keyboard', 'simon', 'garfield', 'felix'],
  // Penguins
  'penguin': ['penguin', 'pengu', 'pingu', 'pudgy', 'tux', 'linux', 'waddle', 'arctic', 'emperor', 'adelie', 'gentoo', 'club', 'happy feet'],
  // Monkeys/Apes
  'monkey': ['monkey', 'ape', 'chimp', 'gorilla', 'orangutan', 'punch', 'bored', 'bayc', 'primate', 'banana', 'jungle', 'kong', 'harambe', 'baboon', 'macaque', 'gibbon', 'simian'],
  // Trump/Politics
  'trump': ['trump', 'donald', 'maga', 'potus', '47', 'melania', 'barron', 'ivanka', 'donaldo', 'mango', 'cheeto', 'bigly', 'yuge', 'covfefe', 'winning', 'drumpf', 'emperor', 'don', 'djt', '45', 'republican', 'gop'],
  // Elon/Tech
  'elon': ['elon', 'musk', 'tesla', 'spacex', 'x', 'mars', 'starship', 'elun', 'muск', 'dojo', 'neuralink', 'boring', 'hyperloop', 'cyber', 'truck', 'roadster', 'rocket', 'technoking', 'dogfather'],
  // AI/Tech
  'ai': ['ai', 'gpt', 'agent', 'bot', 'neural', 'openai', 'anthropic', 'llm', 'claude', 'chatgpt', 'gemini', 'bard', 'copilot', 'midjourney', 'stable', 'diffusion', 'machine', 'learning', 'robot', 'cyborg', 'sentient', 'agi', 'singularity', 'skynet', 'terminator'],
  // Goats
  'goat': ['goat', 'goatse', 'billy', 'ram', 'greatest', 'capricorn', 'ibex', 'mountain', 'horns', 'beard', 'bleat'],
  // Birds
  'bird': ['bird', 'tweet', 'twitter', 'eagle', 'hawk', 'owl', 'parrot', 'crow', 'raven', 'phoenix', 'duck', 'chicken', 'rooster', 'pigeon', 'dove', 'falcon', 'vulture', 'condor', 'flamingo', 'toucan', 'pelican'],
  // Bears
  'bear': ['bear', 'teddy', 'panda', 'grizzly', 'polar', 'koala', 'bearish', 'cub', 'hibernation', 'honey', 'kodiak', 'black', 'brown', 'spirit'],
  // Bulls
  'bull': ['bull', 'toro', 'ox', 'buffalo', 'bison', 'bullish', 'matador', 'rodeo', 'horns', 'charge', 'stampede', 'minotaur', 'brahma', 'angus'],
  // Hippos
  'hippo': ['hippo', 'moodeng', 'moodang', 'pygmy', 'hippopotamus', 'river', 'horse', 'hungry', 'chomp', 'chonk', 'thicc'],
  // Peanut/Squirrels
  'pnut': ['pnut', 'peanut', 'squirrel', 'nut', 'nuts', 'acorn', 'chipmunk', 'nutty', 'cashew', 'almond', 'walnut', 'hazel'],
  // Wif/Hat memes
  'wif': ['wif', 'hat', 'dogwifhat', 'catwif', 'with', 'wearing', 'helmet', 'cap', 'beanie', 'fedora', 'tophat', 'sombrero'],
  // Wojak/Feels
  'wojak': ['wojak', 'wojack', 'soyjak', 'feels', 'brainlet', 'pink', 'doomer', 'bloomer', 'zoomer', 'boomer', 'coomer', 'glow', 'npc', 'chad', 'virgin', 'gigachad', 'sigma', 'alpha', 'beta', 'trad', 'based', 'redpill'],
  // Moon/Space
  'moon': ['moon', 'lunar', 'moonboy', 'mooning', 'tomoon', 'apollo', 'crater', 'tide', 'wolf', 'harvest', 'eclipse', 'fullmoon', 'moonshot', 'moonwalk'],
  // Aliens/UFO
  'alien': ['alien', 'aliens', 'ufo', 'extraterrestrial', 'et', 'area51', 'roswell', 'grey', 'greys', 'grays', 'abduction', 'spaceship', 'martian', 'xfiles', 'contact', 'disclosure', 'seti', 'firstcontact', 'invasion', 'probe', 'mothership', 'reptilian', 'pleiadian', 'nordic', 'annunaki', 'nibiru'],
  // Japanese/Anime
  'anime': ['anime', 'manga', 'waifu', 'senpai', 'kawaii', 'otaku', 'weeb', 'neko', 'chan', 'kun', 'san', 'sama', 'desu', 'baka', 'sugoi', 'naruto', 'goku', 'hentai', 'loli', 'chibi'],
  // China/Chinese
  'china': ['china', 'chinese', 'dragon', 'panda', 'bamboo', 'jade', 'kung', 'wushu', 'shaolin', 'yin', 'yang', 'dynasty', 'emperor', 'mandarin', 'beijing', 'shanghai', 'xi', 'ccp', 'yuan', 'rmb'],
  // Korea/Korean
  'korea': ['korea', 'korean', 'kimchi', 'kpop', 'seoul', 'gangnam', 'oppa', 'noona', 'hyung', 'aegyo', 'hallyu', 'bibimbap', 'soju', 'hanbok'],
  // Food
  'food': ['food', 'burger', 'pizza', 'taco', 'sushi', 'ramen', 'noodle', 'rice', 'bread', 'cheese', 'bacon', 'egg', 'chicken', 'beef', 'pork', 'fish', 'shrimp', 'lobster', 'crab', 'steak', 'fries', 'hotdog', 'sandwich', 'soup', 'salad'],
  // Drinks
  'drink': ['coffee', 'tea', 'beer', 'wine', 'whiskey', 'vodka', 'rum', 'tequila', 'sake', 'champagne', 'cocktail', 'juice', 'soda', 'cola', 'pepsi', 'coke', 'water', 'milk', 'boba', 'bubble'],
  // Drugs/420
  'drugs': ['weed', 'cannabis', 'marijuana', '420', 'blunt', 'joint', 'dank', 'kush', 'sativa', 'indica', 'thc', 'cbd', 'stoner', 'high', 'baked', 'lit', 'blazed', 'shroom', 'psychedelic', 'acid', 'lsd', 'dmt', 'molly', 'mdma'],
  // Money/Finance
  'money': ['money', 'cash', 'dollar', 'usd', 'euro', 'pound', 'yen', 'gold', 'silver', 'diamond', 'rich', 'wealth', 'million', 'billion', 'trillion', 'bank', 'vault', 'treasury', 'fed', 'reserve', 'print', 'brrrr'],
  // Gaming
  'gaming': ['game', 'gamer', 'gaming', 'esport', 'twitch', 'stream', 'xbox', 'playstation', 'nintendo', 'mario', 'zelda', 'pokemon', 'pikachu', 'sonic', 'minecraft', 'fortnite', 'roblox', 'valorant', 'league', 'dota', 'csgo', 'cod', 'gta', 'fifa'],
  // Meme classics
  'meme': ['meme', 'dank', 'based', 'cringe', 'kek', 'lol', 'lmao', 'rofl', 'bruh', 'sus', 'amogus', 'imposter', 'yeet', 'poggers', 'copium', 'hopium', 'ngmi', 'wagmi', 'gm', 'gn', 'ser', 'fren', 'anon'],
};

function getThemes(text: string): string[] {
  const lower = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const themes: string[] = [];
  
  for (const [theme, keywords] of Object.entries(THEME_ENTITIES)) {
    if (keywords.some(kw => lower.includes(kw))) {
      themes.push(theme);
    }
  }
  
  return themes;
}

export function themeMatch(
  runnerName: string,
  runnerSymbol: string,
  tokenName: string,
  tokenSymbol: string
): DetectionResult {
  const runnerThemes = getThemes(`${runnerName} ${runnerSymbol}`);
  const tokenThemes = getThemes(`${tokenName} ${tokenSymbol}`);
  
  const shared = runnerThemes.filter(t => tokenThemes.includes(t));
  
  if (shared.length > 0) {
    // Check if runner is the "main" token for this theme
    const runnerText = `${runnerName} ${runnerSymbol}`.toLowerCase();
    const isMainThemeToken = shared.some(theme => {
      const mainKeyword = THEME_ENTITIES[theme][0];
      return runnerText.includes(mainKeyword);
    });
    
    if (isMainThemeToken) {
      return { matched: true, method: 'theme', confidence: 72, details: `same theme: ${shared.join(', ')}` };
    }
  }
  
  return { matched: false, method: 'theme', confidence: 0 };
}

// ============= LAYER 9: FUZZY STRING =============
export function fuzzyMatch(
  runnerSymbol: string,
  tokenSymbol: string
): DetectionResult {
  const rSym = normalize(runnerSymbol);
  const tSym = normalize(tokenSymbol);
  
  if (rSym === tSym || rSym.length < 4) return { matched: false, method: 'fuzzy', confidence: 0 };
  
  const maxLen = Math.max(rSym.length, tSym.length);
  const dist = levenshtein(rSym, tSym);
  const similarity = 1 - dist / maxLen;
  
  if (similarity >= 0.8) {
    return { matched: true, method: 'fuzzy', confidence: Math.round(similarity * 95), details: `${Math.round(similarity * 100)}% similar` };
  }
  
  return { matched: false, method: 'fuzzy', confidence: 0 };
}

// ============= LAYER 10: REVERSE/ANAGRAM =============
export function reverseMatch(
  runnerSymbol: string,
  tokenSymbol: string
): DetectionResult {
  const rSym = normalize(runnerSymbol);
  const tSym = normalize(tokenSymbol);
  
  if (rSym === tSym || rSym.length < 3) return { matched: false, method: 'reverse', confidence: 0 };
  
  // Check reverse
  const reversed = rSym.split('').reverse().join('');
  if (reversed === tSym) {
    return { matched: true, method: 'reverse', confidence: 82, details: 'reversed spelling' };
  }
  
  // Check if anagram (same letters, different order)
  const rSorted = rSym.split('').sort().join('');
  const tSorted = tSym.split('').sort().join('');
  if (rSorted === tSorted && rSym !== tSym) {
    return { matched: true, method: 'reverse', confidence: 75, details: 'anagram' };
  }
  
  return { matched: false, method: 'reverse', confidence: 0 };
}

// ============= LAYER 11: SUBSTRING RATIO =============
export function substringMatch(
  runnerSymbol: string,
  tokenSymbol: string,
  tokenName: string
): DetectionResult {
  const rSym = normalize(runnerSymbol);
  const tSym = normalize(tokenSymbol);
  const tName = normalize(tokenName);
  
  if (rSym === tSym || rSym.length < 3) return { matched: false, method: 'substring', confidence: 0 };
  
  // Find longest common substring
  function lcs(a: string, b: string): number {
    const m = a.length, n = b.length;
    let max = 0;
    const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));
    
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i-1] === b[j-1]) {
          dp[i][j] = dp[i-1][j-1] + 1;
          max = Math.max(max, dp[i][j]);
        }
      }
    }
    return max;
  }
  
  const lcsSymbol = lcs(rSym, tSym);
  const lcsName = lcs(rSym, tName);
  const best = Math.max(lcsSymbol, lcsName);
  const ratio = best / rSym.length;
  
  if (ratio >= 0.75 && best >= 3) {
    return { matched: true, method: 'substring', confidence: Math.round(70 + ratio * 20), details: `${best}/${rSym.length} chars match` };
  }
  
  return { matched: false, method: 'substring', confidence: 0 };
}

// ============= LAYER 12: COMMON DERIVATIVE INDICATORS =============
const DERIVATIVE_KEYWORDS = [
  'baby', 'mini', 'king', 'queen', 'son', 'daughter', 'wife', 'mother', 'father',
  'revenge', 'returns', 'reborn', 'rising', 'strikes', 'saga', 'classic',
  '2.0', 'pro', 'max', 'ultra', 'super', 'mega', 'giga'
];

export function derivativeKeywordMatch(
  runnerSymbol: string,
  tokenName: string,
  tokenSymbol: string
): DetectionResult {
  const rSym = runnerSymbol.toLowerCase();
  const text = `${tokenName} ${tokenSymbol}`.toLowerCase();
  
  // Check if token name/symbol contains derivative keywords + runner reference
  for (const keyword of DERIVATIVE_KEYWORDS) {
    if (text.includes(keyword)) {
      // Also check if runner is mentioned somewhere
      const words = splitCompound(text);
      for (const word of words) {
        if (word.length >= 3 && rSym.includes(word)) {
          return { matched: true, method: 'keyword', confidence: 78, details: `"${keyword}" + "${word}"` };
        }
      }
    }
  }
  
  return { matched: false, method: 'keyword', confidence: 0 };
}

// ============= MASTER DETECTION FUNCTION =============
export interface FullDetectionResult {
  isDerivative: boolean;
  bestMethod: string;
  confidence: number;
  details: string;
  allMatches: DetectionResult[];
  methodCount: number;
}

export function detectDerivative(
  runnerName: string,
  runnerSymbol: string,
  tokenName: string,
  tokenSymbol: string
): FullDetectionResult {
  // Run all detection methods
  const results: DetectionResult[] = [
    directMatch(runnerName, runnerSymbol, tokenName, tokenSymbol),
    patternMatch(runnerSymbol, tokenName, tokenSymbol),
    wordBoundaryMatch(runnerSymbol, tokenName, tokenSymbol),
    misspellingMatch(runnerSymbol, tokenSymbol),
    phoneticMatch(runnerName, runnerSymbol, tokenName, tokenSymbol),
    leetMatch(runnerSymbol, tokenSymbol),
    ngramMatch(runnerSymbol, tokenSymbol),
    fuzzyMatch(runnerSymbol, tokenSymbol),
    reverseMatch(runnerSymbol, tokenSymbol),
    substringMatch(runnerSymbol, tokenSymbol, tokenName),
    themeMatch(runnerName, runnerSymbol, tokenName, tokenSymbol),
    derivativeKeywordMatch(runnerSymbol, tokenName, tokenSymbol),
  ];
  
  const matches = results.filter(r => r.matched);
  
  if (matches.length === 0) {
    return {
      isDerivative: false,
      bestMethod: 'none',
      confidence: 0,
      details: '',
      allMatches: [],
      methodCount: 0
    };
  }
  
  // Sort by confidence
  matches.sort((a, b) => b.confidence - a.confidence);
  const best = matches[0];
  
  // Boost confidence based on method agreement
  let finalConfidence = best.confidence;
  if (matches.length >= 4) finalConfidence = Math.min(99, finalConfidence + 8);
  else if (matches.length >= 3) finalConfidence = Math.min(99, finalConfidence + 5);
  else if (matches.length >= 2) finalConfidence = Math.min(99, finalConfidence + 2);
  
  return {
    isDerivative: true,
    bestMethod: best.method,
    confidence: finalConfidence,
    details: best.details || '',
    allMatches: matches,
    methodCount: matches.length
  };
}

// ============= BATCH DETECTION =============
export interface TokenInfo {
  id: string;
  name: string;
  symbol: string;
  marketCap: number;
}

export interface DerivativeMatch {
  token: TokenInfo;
  runner: TokenInfo;
  method: string;
  confidence: number;
  details: string;
  methodCount: number;
}

export function findDerivatives(
  runners: TokenInfo[],
  tokens: TokenInfo[]
): DerivativeMatch[] {
  const matches: DerivativeMatch[] = [];
  
  for (const token of tokens) {
    let bestMatch: DerivativeMatch | null = null;
    
    for (const runner of runners) {
      if (runner.id === token.id) continue;
      
      const result = detectDerivative(runner.name, runner.symbol, token.name, token.symbol);
      
      if (result.isDerivative) {
        if (!bestMatch || result.confidence > bestMatch.confidence) {
          bestMatch = {
            token,
            runner,
            method: result.bestMethod,
            confidence: result.confidence,
            details: result.details,
            methodCount: result.methodCount
          };
        }
      }
    }
    
    if (bestMatch) {
      matches.push(bestMatch);
    }
  }
  
  matches.sort((a, b) => b.confidence - a.confidence);
  return matches;
}
