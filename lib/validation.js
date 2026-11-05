const ids = new Set(['kota', 'medley', 'berhimpun', 'daku', 'holy']);
export function validPreparation(x) {
  return x?.version === 1 && Array.isArray(x.songs) && x.songs.length === 5 &&
    new Set(x.songs.map(s => s?.id)).size === 5 && x.songs.every(s => s && ids.has(s.id) &&
      ['title','moment','guide','brief','key','tempo','intro','outro','transition','notes'].every(k => typeof s[k] === 'string') &&
      Array.isArray(s.checks) && s.checks.length === 5 && s.checks.every(c => typeof c === 'boolean') &&
      Array.isArray(s.roles) && s.roles.length === 4 && s.roles.every(r => r && typeof r.name === 'string' && typeof r.text === 'string')) &&
    ['decisions','open'].every(k => Array.isArray(x[k]) && x[k].every(n => n && typeof n.id === 'string' && typeof n.text === 'string' && typeof n.done === 'boolean'));
}
