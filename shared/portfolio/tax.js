// tax.js — what it costs to sell.
//
// Four levels of precision, decided per position when the snapshot is built:
//   free      retirement account; selling costs nothing
//   lots      real lot data; exact highest-cost-basis-first curve
//   avg_cost  average basis only — sizes a trim, cannot optimise which units go
//   unknown   no basis; the tax cost is not computable and is reported as such
//
// Highest-basis-first is both the tax-minimising order and the order the
// brokers actually let you execute, so the curve is not theoretical.

window.PFTax = (function () {
  'use strict';

  var RATES = [['15%', 0.15], ['18.8% + NIIT', 0.188], ['23.8% top', 0.238]];

  // Sell `frac` (0..1) of a position.
  function sell(p, frac, rate) {
    var shares = p.qty * frac;
    var proceeds = shares * p.price;
    if (frac <= 0) return { shares: 0, proceeds: 0, gain: 0, tax: 0, known: true };
    if (!p.trades_taxable) {
      return { shares: shares, proceeds: proceeds, gain: 0, tax: 0, known: true };
    }

    if (p.tax_model === 'lots' && p.lots && p.lots.length) {
      var got = 0, cost = 0;
      for (var i = 0; i < p.lots.length; i++) {
        if (got >= shares - 1e-9) break;
        var take = Math.min(p.lots[i].shares, shares - got);
        got += take; cost += take * p.lots[i].cps;
      }
      // past the transcribed lots, fall back to their average basis
      if (got < shares - 1e-9) cost += (shares - got) * (p.lots_avg_cps || 0);
      var g = proceeds - cost;
      return { shares: shares, proceeds: proceeds, gain: g,
               tax: Math.max(0, g) * rate, known: true };
    }

    if (p.tax_model === 'avg_cost' && p.cost_basis !== null && p.qty) {
      var gg = proceeds - shares * (p.cost_basis / p.qty);
      return { shares: shares, proceeds: proceeds, gain: gg,
               tax: Math.max(0, gg) * rate, known: true };
    }

    return { shares: shares, proceeds: proceeds, gain: null, tax: null,
             known: false };
  }

  // Losses available to offset gains realised anywhere in the taxable accounts.
  // Crypto beats its net position loss because only the underwater lots need
  // to be sold; the estimate of gains sitting in winning lots comes from the
  // snapshot's crypto_lot_profile.
  function harvestPool(S) {
    var h = S.harvest || {};
    var crypto = h.crypto_gross || 0;
    var equity = Math.abs(h.equity_loss_lots || 0);
    return { crypto: crypto, equity: equity, total: crypto + equity };
  }

  // Roll a set of {position, frac} up into one scenario.
  function scenario(S, trims, rate, useHarvest) {
    var proceeds = 0, gain = 0, unknownMV = 0, nUnknown = 0;
    trims.forEach(function (t) {
      var r = sell(t.position, t.frac, rate);
      proceeds += r.proceeds;
      if (r.known) gain += r.gain;
      else if (t.frac > 0) { unknownMV += r.proceeds; nUnknown++; }
    });
    var pool = harvestPool(S).total;
    var offset = useHarvest ? Math.min(pool, Math.max(0, gain)) : 0;
    var taxable = Math.max(0, gain - offset);
    return {
      proceeds: proceeds, gain: gain, offset: offset, pool: pool,
      taxable: taxable, tax: taxable * rate,
      unknownMV: unknownMV, nUnknown: nUnknown,
    };
  }

  // Tax cost across the whole trim range for one position, for the curve.
  function curve(p, rate, steps) {
    steps = steps || 24;
    var out = [];
    for (var i = 0; i <= steps; i++) {
      var f = i / steps;
      var r = sell(p, f, rate);
      out.push({ x: r.shares, y: r.known ? Math.max(0, r.tax) : 0,
                 frac: f, proceeds: r.proceeds,
                 gain: r.known ? r.gain : null });
    }
    return out;
  }

  // Concentration on a set of {symbol, market_value} after a scenario.
  function concentration(map) {
    var vals = Object.keys(map).map(function (k) { return map[k]; })
      .filter(function (v) { return v > 0.005; });
    var tot = vals.reduce(function (a, b) { return a + b; }, 0) || 1;
    var sorted = vals.slice().sort(function (a, b) { return b - a; });
    return {
      total: tot,
      top1: (sorted[0] || 0) / tot * 100,
      top3: sorted.slice(0, 3).reduce(function (a, b) { return a + b; }, 0) / tot * 100,
      hhi: vals.reduce(function (s, v) { return s + Math.pow(v / tot * 100, 2); }, 0),
    };
  }

  return { RATES: RATES, sell: sell, scenario: scenario, curve: curve,
           harvestPool: harvestPool, concentration: concentration };
})();
