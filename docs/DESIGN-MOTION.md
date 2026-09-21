# OrbitFlow visual refresh

The site uses one graphite, warm-orange and cool-white visual system across the marketing site, private inbox, client operations, admissions, privacy and signed-out pages. Existing routes, sign-in rules, forms and business workflows are preserved.

## Readable typography and frosted materials

Headings use Plus Jakarta Sans at 600–700, with Inter at 400–700 for body text, controls and numeric data. Both variable Latin fonts are served from `public/fonts` with `font-display: swap`; the corresponding OFL licenses are included there. Sentence-case hero text, gentler letter spacing and taller line heights replace the wide, heavy display treatment. Main body copy stays at least 16px and regular controls and labels at least 14px.

`app/glass.css` applies frosted materials to navigation, cards, workspace panels, login and dialogs. Highlights and inset edges provide depth while dark surfaces retain a dense tint behind text. Blur is feature-detected and lighter on small screens; unsupported browsers, reduced-transparency and high-contrast preferences receive opaque surfaces. No additional animation loop, dependency or tracking request is introduced. The embedded widget uses the same material treatment with a system-font fallback on external sites.

## Marketing motion

`components/cinematic-backdrop.tsx` renders two viewport-sized ambient scenes. Sections in `app/marketing.tsx` select their scene with `data-film="orbit"` or `data-film="workspace"` when the section passes the middle of the viewport. Scene opacity transitions over 1.15 seconds; a bounded scroll offset adds gentle parallax without changing normal scrolling. `data-film="story"` pauses both ambient films while the dedicated scroll film is in focus.

The marketing page includes a **lead-flow story immediately after the hero**, implemented in `components/lead-flow-story.tsx`. An original simulated coaching enquiry moves through capture, approved course information, and a demo slot. No messages are sent by the marketing example. The CTA opens the existing enquiry form; it does not claim to book a calendar appointment.

`lib/scroll-story.mjs` maps native scroll geometry to a bounded 0–1 film position, three chapters and two state reveals. Forward and reverse scrolling seek the same timeline; no on-mount timer drives the sequence. Seeks are limited to decoded, visible media, skip tiny changes and coalesce while a seek is pending. The film stops work in hidden tabs and outside the viewport. No smooth-scroll replacement or wheel/touch interception is used.

The stage pins only when a desktop viewport is at least 960px wide and the measured panel fits within its height. A `ResizeObserver` rechecks this after font/layout changes. Mobile, short and enlarged-text layouts use normal scrolling and show every workflow step. Without JavaScript, with reduced motion, or with motion paused, the poster and the complete readable example remain. Video sources are absent from server-rendered markup and attached only when motion and visibility permit them.

## Reference adaptation

Visual reference: the user-supplied [Jerry Rogers Instagram reel](https://www.instagram.com/reel/DdC0z_ZRODy/?stkn=NXUyZjB4Z2trcXI0), showing an EVEREST website on a physical laptop. Visual checkpoints were inspected near 2, 8, 13 and 19 seconds. Its full-screen mountain journey and fixed chapter panels are the design reference; the creator's caption, account claims and promotion are not OrbitFlow content. No source footage, mountain artwork, logo or caption was copied into the site.

| Observed pattern | OrbitFlow adaptation |
| --- | --- |
| Full-screen environmental imagery | Original graphite-metal brand film fills the story stage |
| Camera journey through successive landscapes | Native scroll controls the film in either direction |
| Stable text panel over changing scenery | A readable three-chapter coaching workflow remains in place |
| Compact journey/progress indicators | Enquiry, helpful reply and demo-booking rail |
| Large, brief hook above visual proof | One enquiry becomes a clear next step; explicit simulation label |
| Small controls that do not obscure the scene | Existing demo CTA, skip-to-example link and persistent motion control |

The site keeps OrbitFlow's graphite/orange identity rather than adopting the reference's mountain-travel subject. The business goal is a qualified demo enquiry, not a promise of guaranteed conversions or a fabricated customer success story. Admin and client workspaces remain operational surfaces without decorative video.

`components/cinematic-media.tsx` selects the smaller mobile export at 760px and below. It attaches a video source only when its scene is active, visible and motion is enabled. Inactive scenes and hidden tabs pause. Both films are silent, inline and looping. Posters cover initial loading, blocked autoplay and video errors. The existing saved motion preference, reduced-motion preference and data-saver preference control automatic playback; the persistent pause button remains available throughout the page.

## Media provenance

The original looping backgrounds below are **Higgsfield motion edits of existing OrbitFlow assets**, not newly generated AI footage. They remain in Git as fallbacks:

| Scene | Input | Higgsfield processing | Local outputs |
| --- | --- | --- | --- |
| Orbital metal | `public/videos/orbit-motion.mp4` | Subtle contrast/color grade; silent H.264 exports | `public/videos/orbitflow-ambient-desktop.mp4`, `public/videos/orbitflow-ambient-mobile.mp4`, `public/images/orbitflow-ambient-poster.jpg` |
| Workspace | `public/images/orbit-workspace.webp` | Smooth, cyclic camera push over the original artwork; color grade; silent H.264 exports | `public/videos/orbitflow-workspace-desktop.mp4`, `public/videos/orbitflow-workspace-mobile.mp4`, `public/images/orbitflow-workspace-poster.jpg` |

Desktop exports use 1440 × 810; mobile exports use 854 × 480. Both MP4s include fast-start metadata. The orbital film lasts 10 seconds and the workspace film 12 seconds. The website serves the files itself, without runtime requests to Higgsfield or embedding expiring media URLs. The original assets remain available in Git.

A Seedance 2.5 attempt was rejected with `Requires plus plan or higher.` A later comparison found that Kling 3.0 generation was available in the connected Basic account. No plan upgrade or credit purchase was made.

## New AI-generated films

Two eight-second films were successfully generated through Higgsfield with Kling 3.0 Pro, 1920 × 1080, native audio off. Both use existing OrbitFlow artwork as their visual reference. Each generation had a 14-credit preflight estimate. The account balance was verified afterward at 42 credits, confirming 28 credits used within the user's explicitly authorized 70-credit ceiling.

| Film | Brief and placement | Higgsfield generation | Final local files |
| --- | --- | --- | --- |
| Orbital journey | Continuous closer camera movement across brushed titanium; an amber light moves through the ring. Used in the scroll story with native forward/reverse seeking. | `d2f7bf1a-4c3b-474e-bb3a-de8661807300` | `public/videos/orbitflow-journey-desktop.mp4`, `public/videos/orbitflow-journey-mobile.mp4`, `public/images/orbitflow-journey-poster.jpg` |
| Sunset workspace | Restrained architectural camera drift, anonymous distant silhouettes and warm reflections. Matching start/end artwork supports ambient looping in the manifesto, approach and final CTA scenes. | `d39091b7-f297-4e15-b951-3e15bc3217f5` | `public/videos/orbitflow-studio-desktop.mp4`, `public/videos/orbitflow-studio-mobile.mp4`, `public/images/orbitflow-studio-poster.jpg` |

Higgsfield's media tools produced silent H.264 exports at 24 fps with fast-start metadata: 1440 × 810 desktop and 854 × 480 mobile. The journey encodes a keyframe every 12 frames with no B-frames for responsive seeking; it is about 1.92 MB desktop and 695 KB mobile. The workspace is about 465 KB desktop and 184 KB mobile. Both exports last approximately 8.04 seconds. Frames were extracted for asset review before integration. No remote generation URL or account token is needed by the deployed site.

These films are brand imagery, not footage of OrbitFlow's actual office, staff or customers. The original ambient metal loop remains in the hero, where a longer uninterrupted loop is useful. The new journey film does not auto-loop: its position follows the visitor's scroll.

## Workspace styling

`components/workspace-nav.tsx` and `components/orbit-brand.tsx` provide shared branding and route-aware navigation. `app/refinement.css` extends the existing styles without changing the component library or dependencies. Dashboard metrics use real stored data; the marketing workflow card is explicitly labelled as an example. Working surfaces prioritize controls and tables rather than video backgrounds.
