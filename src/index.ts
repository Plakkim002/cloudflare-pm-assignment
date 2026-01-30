export interface Env {
	DB: D1Database;
	AI: Ai;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);

		// Route: Get all feedback
		if (url.pathname === '/feedback') {
			return await getFeedback(env);
		}

		// Route: Analyze severity (the core feature)
		if (url.pathname === '/analyze') {
			return await analyzeSeverity(env);
		}

		// Route: Get top risks
		if (url.pathname === '/risks') {
			return await getTopRisks(env);
		}

		// Default: Simple dashboard
		return new Response(getDashboardHTML(), {
			headers: { 'Content-Type': 'text/html' },
		});
	},
};

// Get all feedback from database
async function getFeedback(env: Env) {
	const { results } = await env.DB.prepare('SELECT * FROM feedback ORDER BY created_at DESC').all();
	return Response.json(results);
}

// Core logic: Analyze feedback and calculate severity scores
async function analyzeSeverity(env: Env) {
	// Get all feedback grouped by category
	const { results } = await env.DB.prepare(`
		SELECT category, COUNT(*) as count, user_type, GROUP_CONCAT(content, ' | ') as samples
		FROM feedback
		GROUP BY category, user_type
	`).all();

	const risks = [];

	for (const row of results as any[]) {
		// Calculate severity score based on:
		// 1. Volume (how many complaints)
		// 2. User type (enterprise = higher weight)
		// 3. Category (performance/reliability = critical)
		
		let score = row.count * 10; // Base: 10 points per complaint
		
		// User type multiplier
		if (row.user_type === 'enterprise') {
			score *= 2.5; // Enterprise issues are 2.5x more critical
		}
		
		// Category multiplier
		const criticalCategories = ['performance', 'reliability', 'billing'];
		if (criticalCategories.includes(row.category)) {
			score *= 1.5;
		}

		// Use Workers AI to analyze sentiment (optional - can remove if AI binding fails)
		let sentiment = 'neutral';
		try {
			const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
				messages: [
					{
						role: 'user',
						content: `Analyze sentiment of these complaints in one word (positive/negative/critical): ${row.samples.substring(0, 500)}`
					}
				],
			}) as any;
			
			sentiment = aiResponse.response?.toLowerCase().includes('critical') ? 'critical' : 
			           aiResponse.response?.toLowerCase().includes('negative') ? 'negative' : 'neutral';
			
			if (sentiment === 'critical') score *= 1.3;
		} catch (e) {
			// AI failed, continue without sentiment
			console.log('AI analysis failed, skipping sentiment');
		}

		risks.push({
			category: row.category,
			user_type: row.user_type,
			complaint_count: row.count,
			severity_score: Math.round(score),
			sentiment: sentiment,
			sample_feedback: row.samples.split(' | ').slice(0, 2), // First 2 examples
		});
	}

	// Sort by severity score
	risks.sort((a, b) => b.severity_score - a.severity_score);

	return Response.json({
		analysis_time: new Date().toISOString(),
		total_risks: risks.length,
		top_risks: risks.slice(0, 5),
		all_risks: risks,
	});
}

// Get top 3 risks (simplified endpoint)
async function getTopRisks(env: Env) {
	const analysis = await analyzeSeverity(env);
	const data = await analysis.json() as any;
	
	return Response.json({
		critical_alerts: data.top_risks.slice(0, 3),
		recommendation: "Focus on enterprise performance issues first - highest churn risk",
	});
}

// Simple HTML dashboard
function getDashboardHTML() {
	return `
<!DOCTYPE html>
<html>
<head>
	<title>Feedback Signal Detector</title>
	<style>
		body { font-family: system-ui; max-width: 1200px; margin: 40px auto; padding: 20px; }
		.card { border: 1px solid #ddd; padding: 20px; margin: 20px 0; border-radius: 8px; }
		.critical { border-left: 4px solid #dc2626; }
		.button { background: #2563eb; color: white; padding: 10px 20px; border: none; border-radius: 6px; cursor: pointer; }
		.score { font-size: 32px; font-weight: bold; color: #dc2626; }
	</style>
</head>
<body>
	<h1>Feedback Signal Detector</h1>
	<p>Real-time anomaly detection for product feedback</p>
	
	<div class="card">
		<h2>Quick Actions</h2>
		<button class="button" onclick="analyze()">Run Analysis</button>
		<button class="button" onclick="viewFeedback()">View All Feedback</button>
		<button class="button" onclick="getTopRisks()">Get Top Risks</button>
	</div>
	
	<div id="results"></div>

	<script>
		async function analyze() {
			const results = document.getElementById('results');
			results.innerHTML = '<p>Analyzing...</p>';
			
			const res = await fetch('/analyze');
			const data = await res.json();
			
			let html = '<div class="card critical"><h2>Top Risks Detected</h2>';
			data.top_risks.forEach(risk => {
				html += \`
					<div style="margin: 20px 0; padding: 15px; background: #fef2f2; border-radius: 6px;">
						<div class="score">\${risk.severity_score}</div>
						<h3>\${risk.category.toUpperCase()} - \${risk.user_type}</h3>
						<p><strong>Complaints:</strong> \${risk.complaint_count} | <strong>Sentiment:</strong> \${risk.sentiment}</p>
						<p><strong>Sample:</strong> "\${risk.sample_feedback[0]}"</p>
					</div>
				\`;
			});
			html += '</div>';
			
			results.innerHTML = html;
		}
		
		async function viewFeedback() {
			const results = document.getElementById('results');
			const res = await fetch('/feedback');
			const data = await res.json();
			
			let html = '<div class="card"><h2>All Feedback (' + data.length + ')</h2><ul>';
			data.forEach(f => {
				html += \`<li><strong>[\${f.source}]</strong> \${f.content} <em>(\${f.user_type})</em></li>\`;
			});
			html += '</ul></div>';
			
			results.innerHTML = html;
		}
		
		async function getTopRisks() {
			const results = document.getElementById('results');
			const res = await fetch('/risks');
			const data = await res.json();
			
			let html = '<div class="card critical"><h2>🔥 Critical Alerts</h2>';
			html += '<p><strong>Recommendation:</strong> ' + data.recommendation + '</p><hr>';
			data.critical_alerts.forEach(alert => {
				html += \`<p>⚠️ <strong>\${alert.category}</strong> (\${alert.user_type}): Score \${alert.severity_score}</p>\`;
			});
			html += '</div>';
			
			results.innerHTML = html;
		}
	</script>
</body>
</html>
	`;
}
