// Shared with the self-contained Worker by leaderboard/sync-name-policy.mjs.
function createDriverNamePolicy() {
  const message = 'Please choose a driver name without bad language or slurs.';
  const strong = [
    'fuck', 'fcuk', 'fvck', 'phuck', 'shit', 'bitch', 'cunt', 'asshole', 'arsehole',
    'asshat', 'assface', 'dumbass', 'jackass', 'bastard', 'goddamn', 'dammit',
    'dickhead', 'dickface', 'dickwad', 'dickweed', 'cocksucker', 'cockhead',
    'pussy', 'dildo', 'wanker', 'whore', 'slut', 'blowjob', 'handjob', 'cumshot',
    'jerkoff', 'jackoff', 'bollocks', 'nigger', 'nigga', 'faggot', 'fagot',
    'faget', 'tranny', 'retard', 'rapist', 'douchebag', 'pornstar', 'pornhub'
  ];
  // Short/ambiguous terms match whole words or common username compounds.
  // This keeps names such as Cassidy, Dickinson, Hancock and Michelle usable.
  const short = ['ass', 'arse', 'dick', 'cock', 'tit', 'tits', 'boob', 'boobs', 'sex',
    'sexy', 'anal', 'cum', 'fag', 'kike', 'chink', 'gook', 'spic', 'dyke', 'twat',
    'piss', 'crap', 'damn', 'hell', 'porn', 'pedo', 'paedo', 'rape', 'nazi', 'hitler', 'fuk', 'fck'];
  const suffixes = ['head', 'face', 'hole', 'wad', 'boy', 'girl', 'man', 'king',
    'lord', 'master', 'racer', 'racing', 'driver', 'lover'];
  // These real place/personal names contain a strong term by coincidence.
  const exceptions = /scunthorpe|nishita?|ishita|akshita?|yoshita(?:ka)?|yoshito|takeshita|matsushita|shiitake|shitake/g;
  const confusables = {};
  for (const [letter, variants] of Object.entries({
    a: 'аαɑ', b: 'вβ', c: 'сϲ', d: 'ԁ', e: 'еε', f: 'ϝ', h: 'н',
    i: 'іιıӏ', j: 'ј', k: 'кκ', m: 'м', n: 'ոη', o: 'оοօ', p: 'рρ',
    s: 'ѕ', t: 'тτ', u: 'υս', x: 'хχ', y: 'у'
  })) for (const char of variants) confusables[char] = letter;
  const leet = { '0': 'o', '1': 'i', '2': 'z', '3': 'e', '4': 'a', '5': 's',
    '6': 'g', '7': 't', '8': 'b', '9': 'g', '@': 'a', '$': 's', '!': 'i', '|': 'i' };
  const stretch = word => word.match(/(.)\1*/g).map(run => run[0] + (run.length === 1 ? '+' : '{' + run.length + ',}')).join('');
  const strongPattern = new RegExp(strong.map(stretch).join('|'));
  const shortTerms = short.map(stretch).join('|');
  const wholePattern = new RegExp('^(?:' + shortTerms + ')(?:(?:' + suffixes.map(stretch).join('|') + '))?$');
  const unframe = word => word.replace(/^x{1,3}|x{1,3}$/g, '');
  function blocked(value) {
    if (typeof value !== 'string') return false;
    const normalized = value.slice(0, 256).normalize('NFKC')
      .replace(/([a-z])([A-Z])/g, '$1 $2').normalize('NFKD')
      .replace(/[\p{M}\p{Cf}]/gu, '').toLowerCase();
    const folded = Array.from(normalized, char => confusables[char] || char).join('');
    for (const variant of [folded, folded.replace(/[0-9@$!|]/g, char => leet[char])]) {
      const words = variant.match(/[a-z]+/g) || [], compact = words.join('');
      if (strongPattern.test(compact.replace(exceptions, 'qqq'))) return true;
      if ([compact, ...words].some(word => wholePattern.test(word) || wholePattern.test(unframe(word)))) return true;
    }
    return false;
  }
  return Object.freeze({
    error: value => blocked(value) ? message : null,
    publicName: (name, id) => blocked(name) ? 'Driver ' + String(id).replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase() : name
  });
}
