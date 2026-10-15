const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../mountain-run/name-policy.js'), 'utf8').trim();
const context = vm.createContext({});
vm.runInContext(source, context);
const policy = vm.runInContext('createDriverNamePolicy()', context);

test('names reject profanity, slurs and common attempts to disguise them', () => {
  for (const name of ['fuck', 'FuCk799', 'f u c k', 'f.u.c.k', 'f-u-c-k',
    'fuuuck', 'fcuk', 'fvck', 'phuck', 'fück', 'ｆｕｃｋ', 'fu\u200bck', 'fuсk',
    'sh1t', '5h1t', 'shiiiit', 's.h.i.t', 'b1tch', 'b!tch', 'a55hole',
    'a$$hole', 'c.u.n.t', 'dickhead', 'cockface', 'xxassxx', 'AssRacer',
    'dumbass', 'wanker', 'whore', 'slut', 'pornstar', 'douchebag',
    'nigger', 'n1gga', 'n.i.g.g.e.r', 'faggot', 'f.a.g.g.o.t', 'retard',
    'nazi', 'hitler', 'k1ke', 'ch1nk', 'fag799', 'sex', 'pussy']) {
    assert.match(policy.error(name) || '', /without bad language or slurs/, name);
  }
});

test('ordinary names and innocent embedded letter sequences remain usable', () => {
  for (const name of ['Mike 799', 'Green 799', 'Silver Fox', 'Hill Runner',
    'Cassidy', 'Cassandra', 'ClassAct', 'Assassin', 'Bassman', 'Dickinson',
    'Hancock', 'Cockburn', 'Scunthorpe', 'Shell', 'Michelle', 'Analyst',
    'Penistone', 'Nishit', 'Ishita', 'Yoshitaka', 'Fuchs', 'Fukuda',
    'Nigel', 'Nigeria', 'Niger', 'José', 'Søren', '佐藤', 'Αλέξανδρος']) {
    assert.equal(policy.error(name), null, name);
  }
});

test('legacy blocked names get a neutral public alias without changing driver ID', () => {
  assert.equal(policy.publicName('Sh1t Driver', 'abcdef12-1234-1234-1234-123456789012'), 'Driver ABCDEF');
  assert.equal(policy.publicName('Mike 799', 'abcdef12-1234-1234-1234-123456789012'), 'Mike 799');
});

test('the paste-ready Worker contains exactly the same policy as the game', () => {
  const worker = fs.readFileSync(require.resolve('../leaderboard/worker.mjs'), 'utf8');
  assert.equal(worker.split('// BEGIN SHARED NAME POLICY\n')[1].split('\n// END SHARED NAME POLICY')[0], source);
});
