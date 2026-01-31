export interface Env {
	DB: D1Database;
	AI: Ai;
	CACHE: KVNamespace;
}

interface FeedbackItem {
	id: number;
	source: string;
	content: string;
	sentiment: number | null;
	category: string;
	user_type: string;
	created_at: string;
}

interface RiskAnalysis {
	category: string;
	user_type: string;
	complaint_count: number;
	severity_score: number;
	sentiment: string;
	trend: string;
	velocity: number;
	sample_feedback: string[];
	recommendation: string;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// CORS headers for API access
		const corsHeaders = {
			'Access-Control-Allow-Origin': '*',
			'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
			'Access-Control-Allow-Headers': 'Content-Type',
		};

		if (request.method === 'OPTIONS') {
			return new Response(null, { headers: corsHeaders });
		}

		// API Routes
		if (url.pathname === '/api/feedback') {
			const response = await getFeedback(env);
			return addCorsHeaders(response, corsHeaders);
		}

		if (url.pathname === '/api/analyze') {
			const response = await analyzeSeverity(env);
			return addCorsHeaders(response, corsHeaders);
		}

		if (url.pathname === '/api/risks') {
			const response = await getTopRisks(env);
			return addCorsHeaders(response, corsHeaders);
		}

		if (url.pathname === '/api/trends') {
			const response = await getTrends(env);
			return addCorsHeaders(response, corsHeaders);
		}

		if (url.pathname === '/api/docs') {
			return new Response(getOpenAPISpec(), {
				headers: { 'Content-Type': 'application/json', ...corsHeaders },
			});
		}

		// Dashboard
		return new Response(getDashboardHTML(), {
			headers: { 'Content-Type': 'text/html' },
		});
	},
};

function addCorsHeaders(response: Response, corsHeaders: any): Response {
	const newHeaders = new Headers(response.headers);
	Object.entries(corsHeaders).forEach(([key, value]) => {
		newHeaders.set(key, value as string);
	});
	return new Response(response.body, {
		status: response.status,
		statusText: response.statusText,
		headers: newHeaders,
	});
}

async function getFeedback(env: Env) {
	const { results } = await env.DB.prepare(
		'SELECT * FROM feedback ORDER BY created_at DESC'
	).all();
	return Response.json(results);
}

async function analyzeSeverity(env: Env): Promise<Response> {
	// Check cache first (5 min TTL)
	const cacheKey = 'analysis:latest';
	const cached = await env.CACHE?.get(cacheKey, 'json');
	if (cached) {
		return Response.json({ ...cached, cached: true });
	}

	const { results } = await env.DB.prepare(`
		SELECT 
			category, 
			user_type,
			COUNT(*) as count,
			GROUP_CONCAT(content, ' ||| ') as samples,
			AVG(julianday('now') - julianday(created_at)) as avg_age_days
		FROM feedback
		GROUP BY category, user_type
	`).all();

	const risks: RiskAnalysis[] = [];

	for (const row of results as any[]) {
		// Base severity calculation
		let score = row.count * 10;

		// User type multiplier (enterprise 3x more critical)
		const userMultiplier = row.user_type === 'enterprise' ? 3.0 : 1.0;
		score *= userMultiplier;

		// Category multiplier
		const criticalCategories: Record<string, number> = {
			'performance': 2.0,
			'reliability': 1.8,
			'billing': 1.7,
			'security': 2.5,
			'data-loss': 3.0,
		};
		score *= criticalCategories[row.category] || 1.0;

		// Recency boost (newer complaints = more urgent)
		const recencyMultiplier = row.avg_age_days < 1 ? 1.5 : row.avg_age_days < 7 ? 1.2 : 1.0;
		score *= recencyMultiplier;

		// AI sentiment analysis
		let sentiment = 'neutral';
		let aiConfidence = 0;

		try {
			const samples = row.samples.substring(0, 800);
			const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
				messages: [
					{
						role: 'system',
						content: 'You are a sentiment analyzer for customer feedback. Respond with JSON only.'
					},
					{
						role: 'user',
						content: `Analyze sentiment of these complaints. Return JSON with format: {"sentiment": "critical|negative|neutral|positive", "confidence": 0-100, "key_issue": "one sentence"}

Complaints: ${samples}`
					}
				],
				max_tokens: 150,
			}) as any;

			const aiText = aiResponse.response || '';
			// Try to extract JSON
			const jsonMatch = aiText.match(/\{[\s\S]*\}/);
			if (jsonMatch) {
				const parsed = JSON.parse(jsonMatch[0]);
				sentiment = parsed.sentiment || 'neutral';
				aiConfidence = parsed.confidence || 0;
			} else {
				// Fallback keyword detection
				sentiment = aiText.toLowerCase().includes('critical') ? 'critical' :
					aiText.toLowerCase().includes('negative') ? 'negative' : 'neutral';
			}

			if (sentiment === 'critical') score *= 1.4;
			else if (sentiment === 'negative') score *= 1.2;
		} catch (e) {
			console.log('AI analysis failed:', e);
		}

		// Trend analysis (velocity)
		const velocity = row.count / Math.max(row.avg_age_days, 0.5); // complaints per day
		let trend = 'stable';
		if (velocity > 5) trend = 'accelerating';
		else if (velocity > 2) trend = 'rising';

		if (trend === 'accelerating') score *= 1.3;

		// Generate recommendation
		const recommendation = generateRecommendation(row.category, row.user_type, trend, sentiment);

		risks.push({
			category: row.category,
			user_type: row.user_type,
			complaint_count: row.count,
			severity_score: Math.round(score),
			sentiment: sentiment,
			trend: trend,
			velocity: Math.round(velocity * 10) / 10,
			sample_feedback: row.samples.split(' ||| ').slice(0, 3),
			recommendation: recommendation,
		});
	}

	risks.sort((a, b) => b.severity_score - a.severity_score);

	const analysis = {
		analysis_time: new Date().toISOString(),
		total_risks: risks.length,
		critical_count: risks.filter(r => r.severity_score > 100).length,
		top_risks: risks.slice(0, 5),
		all_risks: risks,
		cached: false,
	};

	// Cache for 5 minutes
	await env.CACHE?.put(cacheKey, JSON.stringify(analysis), { expirationTtl: 300 });

	return Response.json(analysis);
}

function generateRecommendation(category: string, userType: string, trend: string, sentiment: string): string {
	const recommendations: Record<string, string> = {
		'performance_enterprise_accelerating': 'URGENT: Enterprise performance degradation. Escalate to engineering + customer success immediately.',
		'billing_enterprise': 'High churn risk. Schedule immediate call with affected accounts. Review billing clarity.',
		'reliability_enterprise': 'SLA breach risk. Engage SRE team. Prepare incident report.',
		'dx_developer': 'Developer experience issue. Prioritize docs update + devrel outreach.',
		'documentation': 'Update docs within 48h. Consider video tutorial.',
	};

	const key = `${category}_${userType}_${trend}`;
	return recommendations[key] || recommendations[`${category}_${userType}`] || 
		'Monitor closely. Consider adding to sprint backlog.';
}

async function getTopRisks(env: Env) {
	const analysis = await analyzeSeverity(env);
	const data = await analysis.json() as any;

	return Response.json({
		timestamp: new Date().toISOString(),
		critical_alerts: data.top_risks.slice(0, 3),
		summary: {
			total_critical: data.critical_count,
			recommendation: data.top_risks[0]?.recommendation || 'No critical issues detected',
		},
	});
}

async function getTrends(env: Env) {
	// Trend analysis over time (if we had time-series data)
	const { results } = await env.DB.prepare(`
		SELECT 
			category,
			DATE(created_at) as date,
			COUNT(*) as daily_count
		FROM feedback
		GROUP BY category, DATE(created_at)
		ORDER BY date DESC
		LIMIT 50
	`).all();

	return Response.json({
		trends: results,
		insight: 'Velocity analysis shows complaint patterns over time',
	});
}

function getOpenAPISpec() {
	return JSON.stringify({
		openapi: '3.0.0',
		info: {
			title: 'Feedback Signal Detector API',
			version: '1.0.0',
			description: 'AI-powered feedback analysis and prioritization system',
		},
		paths: {
			'/api/feedback': {
				get: {
					summary: 'Get all feedback',
					responses: {
						'200': { description: 'Array of feedback items' },
					},
				},
			},
			'/api/analyze': {
				get: {
					summary: 'Run severity analysis',
					description: 'Analyzes all feedback and returns prioritized risks with AI sentiment',
					responses: {
						'200': { description: 'Analysis results with severity scores' },
					},
				},
			},
			'/api/risks': {
				get: {
					summary: 'Get top 3 critical risks',
					responses: {
						'200': { description: 'Critical alerts requiring immediate attention' },
					},
				},
			},
			'/api/trends': {
				get: {
					summary: 'Get trend analysis',
					responses: {
						'200': { description: 'Time-series trend data' },
					},
				},
			},
		},
	}, null, 2);
}

function getDashboardHTML() {
	return `
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Feedback Signal Detector - AI-Powered Analysis</title>
	<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
	<style>
		* { margin: 0; padding: 0; box-sizing: border-box; }
		
		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
			background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
			min-height: 100vh;
			padding: 20px;
		}
		
		.container {
			max-width: 1400px;
			margin: 0 auto;
		}
		
		.header {
			background: white;
			padding: 30px;
			border-radius: 16px;
			box-shadow: 0 20px 60px rgba(0,0,0,0.15);
			margin-bottom: 30px;
		}
		
		.header h1 {
			font-size: 36px;
			color: #1a202c;
			margin-bottom: 10px;
			display: flex;
			align-items: center;
			gap: 15px;
		}
		
		.badge {
			background: linear-gradient(135deg, #667eea, #764ba2);
			color: white;
			padding: 6px 12px;
			border-radius: 20px;
			font-size: 14px;
			font-weight: 600;
		}
		
		.subtitle {
			color: #718096;
			font-size: 18px;
		}
		
		.stats-grid {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
			gap: 20px;
			margin-bottom: 30px;
		}
		
		.stat-card {
			background: white;
			padding: 25px;
			border-radius: 12px;
			box-shadow: 0 4px 12px rgba(0,0,0,0.1);
		}
		
		.stat-value {
			font-size: 42px;
			font-weight: 700;
			color: #2d3748;
			margin-bottom: 5px;
		}
		
		.stat-label {
			color: #718096;
			font-size: 14px;
			text-transform: uppercase;
			letter-spacing: 0.5px;
		}
		
		.actions {
			display: flex;
			gap: 15px;
			flex-wrap: wrap;
			margin: 25px 0;
		}
		
		.btn {
			background: linear-gradient(135deg, #667eea, #764ba2);
			color: white;
			border: none;
			padding: 14px 28px;
			border-radius: 8px;
			font-size: 15px;
			font-weight: 600;
			cursor: pointer;
			transition: all 0.3s;
			box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
		}
		
		.btn:hover {
			transform: translateY(-2px);
			box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
		}
		
		.btn-secondary {
			background: white;
			color: #667eea;
			border: 2px solid #667eea;
			box-shadow: none;
		}
		
		.results {
			background: white;
			padding: 30px;
			border-radius: 12px;
			box-shadow: 0 4px 12px rgba(0,0,0,0.1);
			min-height: 200px;
		}
		
		.risk-card {
			border-left: 5px solid #f56565;
			background: #fff5f5;
			padding: 20px;
			margin: 15px 0;
			border-radius: 8px;
			transition: all 0.3s;
		}
		
		.risk-card:hover {
			transform: translateX(5px);
			box-shadow: 0 4px 12px rgba(0,0,0,0.1);
		}
		
		.risk-score {
			font-size: 48px;
			font-weight: 800;
			color: #c53030;
			display: inline-block;
			margin-right: 20px;
		}
		
		.risk-header {
			display: flex;
			align-items: center;
			margin-bottom: 15px;
		}
		
		.risk-title {
			font-size: 24px;
			font-weight: 700;
			color: #2d3748;
		}
		
		.risk-meta {
			display: flex;
			gap: 15px;
			margin: 10px 0;
			flex-wrap: wrap;
		}
		
		.meta-tag {
			background: #edf2f7;
			padding: 5px 12px;
			border-radius: 6px;
			font-size: 13px;
			font-weight: 600;
		}
		
		.trend-up { color: #e53e3e; }
		.trend-stable { color: #d69e2e; }
		
		.recommendation {
			background: #edf2f7;
			padding: 15px;
			border-radius: 6px;
			margin-top: 10px;
			font-weight: 500;
		}
		
		.loading {
			text-align: center;
			padding: 40px;
			color: #718096;
			font-size: 18px;
		}
		
		.chart-container {
			margin-top: 30px;
			background: white;
			padding: 20px;
			border-radius: 12px;
		}
		
		canvas {
			max-height: 400px;
		}
		
		.api-link {
			color: #667eea;
			text-decoration: none;
			font-weight: 600;
			display: inline-flex;
			align-items: center;
			gap: 5px;
		}
		
		.api-link:hover {
			text-decoration: underline;
		}
	</style>
</head>
<body>
	<div class="container">
		<div class="header">
			<h1>
				⚡ Feedback Signal Detector
				<span class="badge">AI-POWERED</span>
			</h1>
			<p class="subtitle">Real-time anomaly detection and priority scoring for product feedback</p>
			<div class="actions">
				<button class="btn" onclick="runAnalysis()">Run Analysis</button>
				<button class="btn" onclick="viewFeedback()"> View All Feedback</button>
				<button class="btn" onclick="getTopRisks()"> Critical Alerts</button>
				<button class="btn btn-secondary" onclick="window.open('/api/docs', '_blank')">📘 API Docs</button>
			</div>
		</div>

		<div class="stats-grid" id="stats" style="display:none;">
			<div class="stat-card">
				<div class="stat-value" id="totalRisks">-</div>
				<div class="stat-label">Total Risks</div>
			</div>
			<div class="stat-card">
				<div class="stat-value" id="criticalCount">-</div>
				<div class="stat-label">Critical Issues</div>
			</div>
			<div class="stat-card">
				<div class="stat-value" id="avgSeverity">-</div>
				<div class="stat-label">Avg Severity</div>
			</div>
			<div class="stat-card">
				<div class="stat-value" id="cached">-</div>
				<div class="stat-label">Cache Status</div>
			</div>
		</div>
		
		<div class="results" id="results">
			<p style="color: #718096; text-align: center;">Click "Run Analysis" to detect priority signals in feedback data</p>
		</div>

		<div class="chart-container" id="chartContainer" style="display:none;">
			<canvas id="severityChart"></canvas>
		</div>
	</div>

	<script>
		let chartInstance = null;

		async function runAnalysis() {
			const results = document.getElementById('results');
			const stats = document.getElementById('stats');
			results.innerHTML = '<p class="loading"> Analyzing feedback with AI...</p>';
			
			const res = await fetch('/api/analyze');
			const data = await res.json();
			
			// Update stats
			stats.style.display = 'grid';
			document.getElementById('totalRisks').textContent = data.total_risks;
			document.getElementById('criticalCount').textContent = data.critical_count;
			document.getElementById('avgSeverity').textContent = 
				Math.round(data.all_risks.reduce((sum, r) => sum + r.severity_score, 0) / data.all_risks.length);
			document.getElementById('cached').textContent = data.cached ? '✓ Cached' : '○ Fresh';
			
			let html = '<h2 style="margin-bottom: 20px; color: #2d3748;"> Top Priority Risks</h2>';
			
			data.top_risks.forEach((risk, i) => {
				const trendIcon = risk.trend === 'accelerating' ? '📈' : risk.trend === 'rising' ? '↗️' : '→';
				html += \`
					<div class="risk-card">
						<div class="risk-header">
							<span class="risk-score">\${risk.severity_score}</span>
							<div>
								<div class="risk-title">\${risk.category.toUpperCase()}</div>
								<div class="risk-meta">
									<span class="meta-tag"> \${risk.user_type}</span>
									<span class="meta-tag"> \${risk.complaint_count} complaints</span>
									<span class="meta-tag"> \${risk.sentiment}</span>
									<span class="meta-tag \${risk.trend === 'accelerating' ? 'trend-up' : 'trend-stable'}">
										\${trendIcon} \${risk.trend} (\${risk.velocity}/day)
									</span>
								</div>
							</div>
						</div>
						<p style="color: #4a5568; margin: 10px 0;"><strong>Sample:</strong> "\${risk.sample_feedback[0]}"</p>
						<div class="recommendation">💡 <strong>Recommendation:</strong> \${risk.recommendation}</div>
					</div>
				\`;
			});
			
			html += '<p style="margin-top: 20px; color: #718096;"><strong>Analysis Time:</strong> ' + 
				new Date(data.analysis_time).toLocaleString() + '</p>';
			
			results.innerHTML = html;
			
			// Render chart
			renderChart(data.all_risks);
		}
		
		function renderChart(risks) {
			const container = document.getElementById('chartContainer');
			const canvas = document.getElementById('severityChart');
			container.style.display = 'block';
			
			if (chartInstance) chartInstance.destroy();
			
			const ctx = canvas.getContext('2d');
			chartInstance = new Chart(ctx, {
				type: 'bar',
				data: {
					labels: risks.map(r => \`\${r.category} (\${r.user_type})\`),
					datasets: [{
						label: 'Severity Score',
						data: risks.map(r => r.severity_score),
						backgroundColor: risks.map(r => 
							r.severity_score > 100 ? 'rgba(229, 62, 62, 0.8)' : 
							r.severity_score > 50 ? 'rgba(237, 137, 54, 0.8)' : 
							'rgba(72, 187, 120, 0.8)'
						),
						borderWidth: 0,
						borderRadius: 8,
					}]
				},
				options: {
					responsive: true,
					maintainAspectRatio: true,
					plugins: {
						legend: { display: false },
						title: {
							display: true,
							text: 'Severity Distribution by Category',
							font: { size: 18, weight: 'bold' }
						}
					},
					scales: {
						y: {
							beginAtZero: true,
							title: { display: true, text: 'Severity Score' }
						}
					}
				}
			});
		}
		
		async function viewFeedback() {
			const results = document.getElementById('results');
			results.innerHTML = '<p class="loading">Loading...</p>';
			
			const res = await fetch('/api/feedback');
			const data = await res.json();
			
			let html = '<h2 style="margin-bottom: 20px;">All Feedback (' + data.length + ' items)</h2>';
			html += '<div style="max-height: 600px; overflow-y: auto;">';
			data.forEach(f => {
				html += \`
					<div style="padding: 15px; margin: 10px 0; background: #f7fafc; border-radius: 8px; border-left: 3px solid #667eea;">
						<strong>[\${f.source}]</strong> \${f.content}
						<div style="margin-top: 5px; font-size: 13px; color: #718096;">
							<span> \${f.user_type}</span> • 
							<span> \${f.category}</span> • 
							<span> \${new Date(f.created_at).toLocaleDateString()}</span>
						</div>
					</div>
				\`;
			});
			html += '</div>';
			results.innerHTML = html;
		}
		
		async function getTopRisks() {
			const results = document.getElementById('results');
			results.innerHTML = '<p class="loading">Loading...</p>';
			
			const res = await fetch('/api/risks');
			const data = await res.json();
			
			let html = '<div style="background: #fff5f5; padding: 30px; border-radius: 12px; border-left: 5px solid #f56565;">';
			html += '<h2 style="color: #c53030; margin-bottom: 20px;">Critical Alerts (' + data.summary.total_critical + ' critical issues)</h2>';
			html += '<p style="background: white; padding: 15px; border-radius: 8px; margin-bottom: 20px;"><strong>Primary Recommendation:</strong> ' + data.summary.recommendation + '</p>';
			
			data.critical_alerts.forEach((alert, i) => {
				html += \`
					<div style="background: white; padding: 20px; margin: 15px 0; border-radius: 8px;">
						<h3 style="color: #2d3748;">\${i+1}. \${alert.category.toUpperCase()} - \${alert.user_type}</h3>
						<p style="margin: 10px 0;"><strong>Severity:</strong> \${alert.severity_score} | <strong>Trend:</strong> \${alert.trend}</p>
						<p style="color: #4a5568;">"\${alert.sample_feedback[0]}"</p>
					</div>
				\`;
			});
			html += '</div>';
			results.innerHTML = html;
		}
	</script>
</body>
</html>
	`;
}
