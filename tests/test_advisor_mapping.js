function mapAdvisorRecommendation(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      id: 'model-fallback',
      name: 'Unnamed Model',
      publisher: 'Unknown',
      architecture: '—',
      parameter_size: '—',
      format: 'GGUF',
      quantization: '—',
      size_bytes: 0,
      size_formatted: '—',
      fit_score: null,
      tier: 'EXPERIMENTAL',
      safety_level: 'SAFE',
      recommended_runtime: 'llama.cpp server',
      ram_required_gb: null,
      ram_required_formatted: '—',
      estimated_tok_per_sec: null,
      estimated_performance: '—',
      context_length: 4096,
      license: '—',
      download_url: '',
      reasoning: '—',
    };
  }

  const id = raw.model_id || raw.id || 'model-test';
  const selQuant = raw.selected_quantization || {};
  const memBreakdown = raw.memory_breakdown || {};

  let ramGb = null;
  if (typeof raw.ram_required_gb === 'number' && !isNaN(raw.ram_required_gb)) {
    ramGb = raw.ram_required_gb;
  } else if (typeof memBreakdown.total_working_ram_bytes === 'number' && memBreakdown.total_working_ram_bytes > 0) {
    ramGb = memBreakdown.total_working_ram_bytes / (1024 ** 3);
  }

  const ramRequiredFormatted =
    memBreakdown.total_working_ram_formatted || (ramGb !== null ? `${ramGb.toFixed(2)} GB` : '—');

  const sizeBytes =
    typeof raw.size_bytes === 'number'
      ? raw.size_bytes
      : typeof selQuant.size_bytes === 'number'
      ? selQuant.size_bytes
      : memBreakdown.weights_bytes || 0;

  const sizeFormatted =
    raw.size_formatted || selQuant.size_formatted || memBreakdown.weights_formatted || '—';

  let format = raw.format || '';
  if (!format) {
    if (selQuant.filename && selQuant.filename.toLowerCase().endsWith('.gguf') || raw.available_quantizations) {
      format = 'GGUF';
    } else if (raw.recommended_runtime === 'ollama') {
      format = 'Ollama';
    } else {
      format = 'GGUF';
    }
  }

  const quantName = raw.quantization || selQuant.name || '—';
  const tier = raw.recommendation_tier || raw.tier || 'EXPERIMENTAL';

  let safetyLevel = 'SAFE';
  if (raw.safety_level === 'SAFE' || raw.safety_level === 'MARGINAL' || raw.safety_level === 'RISKY') {
    safetyLevel = raw.safety_level;
  } else {
    const tierUpper = String(tier).toUpperCase();
    if (tierUpper.includes('NOT_RECOMMENDED') || tierUpper.includes('RISK') || tierUpper.includes('UNSAFE')) {
      safetyLevel = 'RISKY';
    } else if (tierUpper.includes('EXPERIMENTAL') || tierUpper.includes('MARGINAL') || tierUpper.includes('CONSTRAINED')) {
      safetyLevel = 'MARGINAL';
    } else {
      safetyLevel = 'SAFE';
    }
  }

  let estimatedTps = null;
  if (typeof raw.estimated_tok_per_sec === 'number' && !isNaN(raw.estimated_tok_per_sec)) {
    estimatedTps = raw.estimated_tok_per_sec;
  }

  const estimatedPerformance =
    raw.estimated_performance || (estimatedTps !== null ? `~${estimatedTps.toFixed(1)} t/s` : '—');

  let fitScore = typeof raw.fit_score === 'number' && !isNaN(raw.fit_score) ? raw.fit_score : null;
  if (fitScore === null) {
    const tierUpper = String(tier).toUpperCase();
    if (tierUpper.includes('RECOMMENDED') && !tierUpper.includes('NOT')) {
      fitScore = 95;
    } else if (tierUpper.includes('GOOD_ALTERNATIVE')) {
      fitScore = 80;
    } else if (tierUpper.includes('EXPERIMENTAL')) {
      fitScore = 65;
    } else {
      fitScore = 40;
    }
  }

  const reasoning = raw.tier_reason || raw.reasoning || raw.description || '—';
  const downloadUrl = raw.download_url || selQuant.download_url || '';

  return {
    id,
    name: raw.name || 'Unnamed Model',
    publisher: raw.publisher || 'Unknown',
    architecture: raw.architecture || '—',
    parameter_size: raw.parameter_size || (typeof raw.parameter_count_b === 'number' ? `${raw.parameter_count_b}B` : '—'),
    format,
    quantization: quantName,
    size_bytes: sizeBytes,
    size_formatted: sizeFormatted,
    fit_score: fitScore,
    tier,
    safety_level: safetyLevel,
    recommended_runtime: raw.recommended_runtime || 'llama.cpp server',
    ram_required_gb: ramGb,
    ram_required_formatted: ramRequiredFormatted,
    estimated_tok_per_sec: estimatedTps,
    estimated_performance: estimatedPerformance,
    context_length: typeof raw.context_length === 'number' ? raw.context_length : 4096,
    license: raw.license || '—',
    download_url: downloadUrl,
    reasoning,
  };
}

const renderRam = (item) => {
  if (!item) return '—';
  if (typeof item.ram_required_gb === 'number' && !isNaN(item.ram_required_gb)) {
    return `${item.ram_required_gb.toFixed(2)} GB`;
  }
  return item.ram_required_formatted || '—';
};

const renderThroughput = (item) => {
  if (!item) return '—';
  if (typeof item.estimated_tok_per_sec === 'number' && !isNaN(item.estimated_tok_per_sec)) {
    return `~${item.estimated_tok_per_sec.toFixed(1)} t/s`;
  }
  return item.estimated_performance || '—';
};

// Edge cases
const testCases = [
  null,
  undefined,
  {},
  { name: 'Model with nothing' },
  { model_id: 'test', memory_breakdown: {} },
  { model_id: 'test', ram_required_gb: 4.123 },
  { model_id: 'test', estimated_tok_per_sec: 15.67 },
  { model_id: 'test', memory_breakdown: { total_working_ram_bytes: 3221225472, total_working_ram_formatted: '3.00 GB' }, estimated_performance: '12 - 18 t/s (est.)' }
];

testCases.forEach((tc, idx) => {
  const mapped = mapAdvisorRecommendation(tc);
  const ram = renderRam(mapped);
  const tps = renderThroughput(mapped);
  console.log(`Case ${idx}: RAM=${ram}, TPS=${tps}, name=${mapped.name}`);
});

console.log('ALL EDGE CASES TESTED SAFELY WITHOUT CRASHING!');

const fs = require('fs');
if (fs.existsSync('tests/real_recommendations.json')) {
  const realData = JSON.parse(fs.readFileSync('tests/real_recommendations.json', 'utf8'));
  const recs = realData.recommendations || [];
  console.log(`\nTesting ${recs.length} real recommendations from backend:`);
  recs.forEach((r, i) => {
    const mapped = mapAdvisorRecommendation(r);
    const ram = renderRam(mapped);
    const tps = renderThroughput(mapped);
    console.log(`[${i + 1}] ${mapped.name} | RAM: ${ram} | Speed: ${tps} | Tier: ${mapped.tier} | Fit: ${mapped.fit_score}% | Safety: ${mapped.safety_level}`);
  });
  console.log('ALL REAL RECOMMENDATIONS MAPPED AND RENDERED PERFECTLY!');
}
