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


  // 2026 brackets, inflation-estimated from 2025 — thresholds move and these
  // are not authoritative, which is why every derived rate stays overridable.
  var ORDINARY = {
    single: [[12400, .10], [50400, .12], [105700, .22], [201775, .24],
             [256225, .32], [640600, .35], [Infinity, .37]],
    mfj:    [[24800, .10], [100800, .12], [211400, .22], [403550, .24],
             [512450, .32], [768700, .35], [Infinity, .37]],
  };
  var LTCG = {
    single: [[50400, 0], [556700, .15], [Infinity, .20]],
    mfj:    [[100800, 0], [626350, .15], [Infinity, .20]],
  };
  var NIIT_THRESHOLD = { single: 200000, mfj: 250000 };
  var NIIT = 0.038;

  // State. California taxes capital gains as ordinary income, so there is one
  // progressive table rather than a separate LTCG rate. 2026 estimates; the
  // published tables disagree slightly on where the 9.3% band starts, but every
  // version puts $150k-$350k squarely inside it, so the rate that matters here
  // is not sensitive to that.
  //
  // Residency is what actually selects this: a sale closed while a Texas
  // resident is not California-source income. Moving on 10/1 makes the toggle a
  // question about the settlement date, not about where you live today.
  var STATE = {
    TX: { label: 'Texas', brackets: null },
    CA: { label: 'California', brackets: {
      single: [[10756, .01], [25499, .02], [40245, .04], [55866, .06],
               [70606, .08], [360659, .093], [432787, .103], [721314, .113],
               [1000000, .123], [Infinity, .133]],
      mfj:    [[21512, .01], [50998, .02], [80490, .04], [111732, .06],
               [141212, .08], [721318, .093], [865574, .103], [1442628, .113],
               [1000000, .123], [Infinity, .133]],
    } },
  };

  function stateRate(state, income, filing) {
    var st = STATE[state];
    if (!st || !st.brackets) return 0;
    return marginal(st.brackets[(filing === 'mfj') ? 'mfj' : 'single'],
                    Number(income) || 0);
  }

  function marginal(table, income) {
    for (var i = 0; i < table.length; i++) {
      if (income <= table[i][0]) return table[i][1];
    }
    return table[table.length - 1][1];
  }

  // Two different rates, and confusing them is the usual mistake:
  //   ltcg     long-term capital gains + NIIT — taxable-account SALES
  //   ordinary marginal income rate — traditional-IRA WITHDRAWALS, short-term
  // `configured` distinguishes "no income on file" from "an income of zero".
  // Without it a missing profile derives a real-looking 0% LTCG, which is how
  // the page came to display 0.0% while taxing at 18.8%.
  function deriveRates(income, filing, state) {
    filing = (filing === 'mfj') ? 'mfj' : 'single';
    var configured = income !== null && income !== undefined && income !== '';
    income = Number(income) || 0;
    var base = marginal(LTCG[filing], income);
    var niit = income > NIIT_THRESHOLD[filing] ? NIIT : 0;
    var st = stateRate(state, income, filing);
    var ord = marginal(ORDINARY[filing], income);
    return {
      filing: filing, income: income, configured: configured,
      state: STATE[state] ? state : 'TX', stateRate: st,
      ltcgBase: base, niit: niit,
      ltcg: base + niit + st,          // what a taxable SALE costs, all-in
      ltcgFed: base + niit,
      ordinary: ord + st,              // what an IRA WITHDRAWAL costs, all-in
      ordinaryFed: ord,
      note: 'LTCG ' + (base * 100).toFixed(0) + '%' +
            (niit ? ' + ' + (niit * 100).toFixed(1) + '% NIIT' : '') +
            (st ? ' + ' + (st * 100).toFixed(1) + '% ' + state : '') +
            ' · ordinary ' + (ord * 100).toFixed(0) + '%' +
            (st ? ' + ' + (st * 100).toFixed(1) + '%' : ''),
    };
  }

  // The deferred ordinary-income liability sitting inside pre-tax accounts.
  // Unlike a taxable account, it is owed on the WHOLE balance, not the gain.
  function deferredLiability(S, ordinaryRate, stRate) {
    var pre = S.positions.filter(function (p) {
      return p.tax_class === 'pretax'; })
      .reduce(function (s, p) { return s + p.market_value; }, 0);
    var rate = (ordinaryRate || 0) + (stRate || 0);
    return { balance: pre, rate: rate, tax: pre * rate, net: pre * (1 - rate) };
  }

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

  return { STATE: STATE, sell: sell, scenario: scenario, curve: curve,
           harvestPool: harvestPool, concentration: concentration,
           deriveRates: deriveRates, deferredLiability: deferredLiability };
})();
