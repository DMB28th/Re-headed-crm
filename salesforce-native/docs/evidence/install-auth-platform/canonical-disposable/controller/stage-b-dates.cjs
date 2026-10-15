'use strict';
// Pure session projection. Collectors must still verify the complete history
// against actual current apps; this synthetic terminal is not live readback.
const {verifyReviewedDates} = require('./dates.cjs');
const need = (value, code) => { if (!value) throw Error(code); };

async function selectSessionTransitions({historicalApps, baselineApps, identity, transitions, verifyProof, now}) {
 const {normalizeId, equal} = require('./core.cjs');
 const history = structuredClone(historicalApps), baseline = structuredClone(baselineApps);
 const chain = structuredClone(transitions), who = structuredClone(identity);
 const exactId = value => need(typeof value === 'string' && value.length === 18 && normalizeId(value) === value, 'SESSION_ID_REQUIRED');
 for (const apps of [history, baseline]) {
  need(Array.isArray(apps) && apps.length === 4, 'SESSION_APP_BINDING');
  for (const app of apps) { exactId(app.id); need(typeof app.name === 'string' && app.name.length > 0, 'SESSION_APP_BINDING'); }
  need(new Set(apps.map(app => app.id)).size === 4 && new Set(apps.map(app => app.name)).size === 4, 'SESSION_APP_BINDING');
 }
 need(equal(history.map(({id,name}) => ({id,name})), baseline.map(({id,name}) => ({id,name}))), 'SESSION_APP_BINDING');
 exactId(who?.org); exactId(who?.actor);
 need(Array.isArray(chain), 'SESSION_TRANSITIONS_REQUIRED');
 for (const proof of chain) { exactId(proof.org); exactId(proof.controller); exactId(proof.appId); }
 const historical = history.find(app => app.name === 'Card_Stack_SFAPP');
 const target = baseline.find(app => app.name === 'Card_Stack_SFAPP');
 need(historical && target && typeof target.policies?.jwtEnabled === 'boolean', 'SESSION_APP_BINDING');

 // Validate provenance, private approvals, continuity and time for ALL proofs,
 // including any suffix and historical proofs that will be projected away.
 const terminalApps = structuredClone(history);
 if (chain.length) {
  const last = chain[chain.length - 1], terminal = terminalApps.find(app => app.id === historical.id);
  terminal.lastModifiedDate = last.toLastModifiedDate;
  terminal.policies = {...terminal.policies, jwtEnabled:last.jwtOn};
 }
 await verifyReviewedDates({baselineApps:history, currentApps:terminalApps, identity:who, transitions:chain, verifyProof, now});

 const initialJwt = historical.policies?.jwtEnabled ?? chain[0]?.fromJwtOn;
 const boundaries = [];
 const matches = (date, jwt) => date === target.lastModifiedDate && jwt === target.policies.jwtEnabled;
 if (matches(historical.lastModifiedDate, initialJwt)) boundaries.push(0);
 chain.forEach((proof, index) => {
  if (proof.appId === target.id && proof.appName === target.name && matches(proof.toLastModifiedDate, proof.jwtOn)) boundaries.push(index + 1);
 });
 need(boundaries.length > 0, 'SESSION_DATE_BOUNDARY_REQUIRED');
 need(boundaries.length === 1, 'SESSION_DATE_BOUNDARY_AMBIGUOUS');
 const boundary = boundaries[0];
 await verifyReviewedDates({baselineApps:history, currentApps:baseline, identity:who, transitions:chain.slice(0,boundary), verifyProof, now});
 return structuredClone(chain.slice(boundary));
}

module.exports = {selectSessionTransitions};
