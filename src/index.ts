/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export interface Env {
	// Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
	// MY_KV_NAMESPACE: KVNamespace;
	//
	// Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
	// MY_DURABLE_OBJECT: DurableObjectNamespace;
	//
	// Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
	STATIC: R2Bucket;
	//
	// Example binding to a Service. Learn more at https://developers.cloudflare.com/workers/runtime-apis/service-bindings/
	// MY_SERVICE: Fetcher;
	//
	// Example binding to a Queue. Learn more at https://developers.cloudflare.com/queues/javascript-apis/
	// MY_QUEUE: Queue;
}

const ALLOWED_METHODS = ['OPTIONS', 'GET', 'HEAD'];

const isNotUndefined = <T>(x: T | undefined): x is T => x !== undefined;

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		if (!ALLOWED_METHODS.includes(request.method)) {
			return new Response('Method Not Allowed', { status: 405, headers: { Allow: ALLOWED_METHODS.join(', ') } });
		}
		if (url.hostname !== 'multichzzk.tv') {
			return Response.redirect(`https://multichzzk.tv${url.pathname}`, 301);
		}
		if (request.method === 'OPTIONS') {
			return new Response(null, { status: 204, headers: { Allow: ALLOWED_METHODS.join(', ') } });
		}
		const isHead = request.method === 'HEAD';

		if (url.pathname.includes('.')) {
			const objectName = url.pathname.slice(1);
			const object = isHead
				? await env.STATIC.head(objectName)
				: await env.STATIC.get(objectName, {
						range: request.headers,
						onlyIf: request.headers,
					});
			if (object === null) {
				return new Response('Not Found', { status: 404 });
			}

			const headers = new Headers();
			object.writeHttpMetadata(headers);
			headers.set('etag', object.httpEtag);
			if (object.range != null) {
				// @ts-expect-error offset and length are always present
				headers.set('content-range', `bytes ${object.range.offset}-${object.range.offset + object.range.length - 1}/${object.size}`);
			}
			const body = 'body' in object ? (object as R2ObjectBody).body : null;
			const status = isHead || body ? (request.headers.get('range') !== null ? 206 : 200) : 304;
			return new Response(body, { headers, status });
		}

		const stream = url.pathname
			.split('/')
			.map((s) => {
				if (/^[0-9a-f]{32}$/i.test(s)) {
					return { name: s.substring(0, 6), player: `https://chzzk.naver.com/live/${s}`, chat: `https://chzzk.naver.com/live/${s}/chat` };
				} else if (/^[a-z0-9_]{4,25}$/i.test(s)) {
					return {
						name: s,
						player: `https://player.twitch.tv/?channel=${s}&parent=${url.hostname}`,
						chat: `https://www.twitch.tv/embed/${s}/chat?darkpopout&parent=${url.hostname}`,
					};
				} else if (/^a:[a-z0-9]{3,12}$/i.test(s)) {
					return { player: `https://play.afreecatv.com/${s.slice(2)}/embed` };
				} else if (/^y:[a-zA-Z0-9_\-]{11}$/.test(s)) {
					s = s.slice(2);
					return {
						name: s,
						player: `https://www.youtube.com/embed/${s}?autoplay=1`,
						chat: `https://www.youtube.com/live_chat?v=${s}&embed_domain=${url.hostname}&dark_theme=1`,
					};
				}
			})
			.filter(isNotUndefined);
		const chats = stream.filter((s) => s.chat);
		chats.push({ name: '닫기', player: '', chat: 'about:blank' });
		const html = `<!DOCTYPE html>
<html lang="ko">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<title>MultiChzzk.tv</title>
		<link rel="icon" href="/favicon.ico" sizes="32x32" />
		<link rel="icon" href="/icon.svg" type="image/svg+xml" />
		<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
		<link rel="manifest" href="/manifest.webmanifest" />
		<style>
			html,
			body {
				margin: 0;
				padding: 0;
				width: 100%;
				height: 100%;
				color: white;
				background-color: black;
				overflow: hidden;
			}

			.container {
				display: flex;
				width: 100%;
				height: 100%;
			}

			#streams {
				display: flex;
				flex-wrap: wrap;
				flex-grow: 1;
				align-items: center;
				align-content: center;
				justify-content: center;
				width: min-content;
				height: 100%;
			}

			#streams iframe {
				flex-grow: 1;
				aspect-ratio: 16 / 9;
			}

			#chat {
				width: 350px;
				height: 100%;
			}

			#chats {
				position: fixed;
				top: 0;
				right: 0;
				margin: 4px;
				padding: 4px;
				border-radius: 4px;
				background-color: rgba(0, 0, 0, 0.8);
				opacity: 0;
				transition: opacity 150ms ease-in-out;
			}

			#chats:hover {
				opacity: 1;
			}

			#chats a {
				color: #ddd;
				text-decoration: none;
			}

			#chats a:hover {
				color: #fff;
			}
		</style>
	</head>
	<body>
		<div class="container">
			<div id="streams">
				${
					stream.length > 0
						? stream
								.map((s) => `<iframe src=${JSON.stringify(s!.player)} frameborder="0" scrolling="no" allowfullscreen="true"></iframe>`)
								.join('\n\t\t\t\t')
						: `<div>
					<h1>MultiChzzk.tv</h1>
					<div>여러 방송을 함께 볼 수 있습니다.</div>
					<ul>
						<li>치지직 UID</li>
						<li>Twitch 아이디</li>
						<li>a:아프리카TV 아이디</li>
						<li>y:YouTube 영상 아이디</li>
					</ul>
					<div><b>예시:</b> https://multichzzk.tv/abcdef1234567890abcdef1234567890/twitch/a:afreeca/y:youtube-_id</div>
				</div>`
				}
			</div>
			<iframe src=${JSON.stringify(chats[0].chat)} frameborder="0" scrolling="no" id="chat" name="chat"></iframe>
		</div>
		<div id="chats">
			${chats.map((s) => `<a href=${JSON.stringify(s.chat)} target="chat">${s!.name}</a>`).join(' |\n\t\t\t')}
		</div>
		<script type="text/javascript">
		  const streams = document.getElementById("streams");
		  const chat = document.getElementById("chat");
			const frames = streams.querySelectorAll("iframe");
			const n = frames.length;
			function adjustLayout() {
				let isChatOpen = true;
				try {
					isChatOpen = window.frames.chat.location.href !== "about:blank";
				} catch {}
				chat.style.display = isChatOpen ? "block" : "none";

				const width = window.innerWidth - 8 - (isChatOpen ? 350 : 0);
				const height = window.innerHeight - 8;

				let bestWidth = 0;
				let bestHeight = 0;
				for (let cols = 1; cols <= n; cols++) {
					const rows = Math.ceil(n / cols);
					let maxWidth = Math.floor(width / cols);
					let maxHeight = Math.floor(height / rows);
					if ((maxWidth * 9) / 16 < maxHeight) {
						maxHeight = Math.floor((maxWidth * 9) / 16);
					} else {
						maxWidth = Math.floor((maxHeight * 16) / 9);
					}
					if (maxWidth > bestWidth) {
						bestWidth = maxWidth;
						bestHeight = maxHeight;
					}
				}
				frames.forEach((f) => {
					f.style.flexGrow = 0;
					f.style.width = \`\${bestWidth}px\`;
					f.style.height = \`\${bestHeight}px\`;
				});
			}

			adjustLayout();
			window.addEventListener("resize", adjustLayout);
			chat.addEventListener("load", adjustLayout);
		</script>
	</body>
</html>
`;
		return new Response(isHead ? null : html, {
			headers: {
				'content-type': 'text/html; charset=utf-8',
				'content-security-policy':
					"base-uri 'self'; default-src 'self'; script-src 'sha256-vFvB+nznXOTKnIktnYN87qOm2fFxx6/5g3AF9PT7Pa0='; style-src 'sha256-N8IjiM2XUSVzLDHaWk5ztB66Pl3+ozn9diQDsTMYWPU='; frame-src 'self' chzzk.naver.com *.chzzk.naver.com *.twitch.tv *.afreecatv.com www.youtube.com; object-src 'none'",
				'strict-transport-security': 'max-age=31536000; includeSubDomains',
				'x-content-type-options': 'nosniff',
			},
		});
	},
};
