import { useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpRightIcon,
  HeartIcon,
  PauseIcon,
  PencilSimpleIcon,
} from "@phosphor-icons/react";
import { REVIEW_STAGES } from "./review-tour.js";
import "./review.css";

// This entry has English review copy only. Keep lesson resources out of the
// restricted build, including the locale registry's lazy module references.
export const dynamicLocale = () => null;

export function SiteEntry() {
  const [stageIndex, setStageIndex] = useState(0);
  const stage = REVIEW_STAGES[stageIndex];
  if (!stage) throw new TypeError("A known review stage is required.");
  return (
    <main className="licence-review">
      <header className="review-header">
        <div className="brand">
          <span className="brand-mark">
            <PencilSimpleIcon size={25} weight="duotone" />
          </span>
          <span className="wordmark">Trazolino</span>
        </div>
        <span className="review-badge">Hobby licence review</span>
      </header>

      <section className="review-hero" aria-labelledby="review-title">
        <div className="review-hero-copy">
          <p className="eyebrow">A PERSONAL, NONCOMMERCIAL FAMILY PROJECT</p>
          <h1 id="review-title">
            One little line.
            <br />
            No need to rush.
          </h1>
          <p className="review-lead">
            I'm building a drawing companion for time with my daughter. It shows
            one little part on screen, then waits while we try it together on
            paper.
          </p>
          <p className="review-hero-note">
            <span aria-hidden="true" />
            Local prototype built with the tldraw React SDK.
          </p>
          <a className="review-link" href="#lesson-preview">
            Take a look at the lesson <ArrowDownIcon size={18} />
          </a>
        </div>
        <figure className="review-hero-media">
          <img
            src="/review/tour-finish.jpg"
            width="1280"
            height="960"
            alt="Actual local Trazolino prototype, with a completed cat on its tldraw demonstration board and family-controlled lesson buttons."
            fetchPriority="high"
          />
          <figcaption>
            A teacher's drawing on screen. A child's drawing on paper.
          </figcaption>
        </figure>
      </section>

      <div className="review-status" role="note">
        <strong>A preview for my hobby licence application.</strong>
        <p>
          This page presents the local prototype through screenshots. The hosted
          lesson will be enabled after a hobby licence is approved and its key
          is configured.
        </p>
      </div>

      <section
        id="lesson-preview"
        className="review-preview"
        aria-labelledby="preview-title"
      >
        <div className="review-section-heading">
          <p className="eyebrow">A SHORT TOUR OF THE LOCAL PROTOTYPE</p>
          <h2 id="preview-title">Watch a little. Try it together.</h2>
          <p>
            Choose a stage to explore the real interface. This is a manual
            screenshot walkthrough.
          </p>
        </div>
        <div
          className="review-chapters"
          role="group"
          aria-label="Screenshot walkthrough stages"
        >
          {REVIEW_STAGES.map((item, index) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={stageIndex === index}
              aria-controls="prototype-screenshot"
              onClick={() => setStageIndex(index)}
            >
              <span className="review-chapter-number" aria-hidden="true">
                0{index + 1}
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
        <figure id="prototype-screenshot" className="review-tour-frame">
          <img
            src={stage.image}
            width="1280"
            height="960"
            alt={stage.alt}
            loading="lazy"
          />
          <figcaption>
            <div aria-live="polite" aria-atomic="true">
              <strong>{stage.title}</strong>
              <p>{stage.caption}</p>
            </div>
            <a href={stage.image} target="_blank" rel="noopener noreferrer">
              View full size <ArrowUpRightIcon size={17} />
            </a>
          </figcaption>
        </figure>
      </section>

      <section className="review-about" aria-labelledby="tldraw-title">
        <div>
          <p className="eyebrow">WHY TLDRAW</p>
          <h2 id="tldraw-title">
            A drawing surface
            <br />
            for a patient teacher.
          </h2>
          <p>
            The local prototype uses the tldraw React SDK as a read-only
            teaching board. Authored cat drawings are revealed one movement at a
            time, with replay and a stable view of the earlier steps.
          </p>
          <p>
            tldraw gives me the drawing surface, shape records and camera
            controls. The lesson controller handles pacing separately: neither
            narration nor the end of a demonstration moves us to the next step.
          </p>
          <p>
            My daughter draws on paper. The website doesn't capture or evaluate
            her picture.
          </p>
        </div>
        <aside className="review-project-facts" aria-labelledby="facts-title">
          <h3 id="facts-title">A small project, on purpose.</h3>
          <dl>
            <div>
              <dt>Purpose</dt>
              <dd>Personal, noncommercial family use.</dd>
            </div>
            <div>
              <dt>Commercial offering</dt>
              <dd>No ads, subscriptions or payments.</dd>
            </div>
            <div>
              <dt>Current status</dt>
              <dd>
                Working local prototype. Hosted lesson awaiting a hobby key.
              </dd>
            </div>
            <div>
              <dt>Project domain</dt>
              <dd className="review-domain">
                {window.location.hostname}
              </dd>
            </div>
          </dl>
          <p>
            The SDK and its licence checks are unchanged. This review page does
            not run an unlicensed tldraw instance.
          </p>
        </aside>
      </section>

      <section className="review-family" aria-labelledby="family-title">
        <div className="review-family-copy">
          <p className="eyebrow">MADE FOR DRAWING TOGETHER</p>
          <h2 id="family-title">
            The paper is theirs.
            <br />
            The time is ours.
          </h2>
          <ul>
            <li>
              <HeartIcon size={23} />
              <div>
                <strong>A grown-up alongside.</strong>
                <p>
                  Designed for an adult to stay present. Age bands offer
                  starting guidance, not a test of a child's ability.
                </p>
              </div>
            </li>
            <li>
              <PauseIcon size={23} />
              <div>
                <strong>No timer to race.</strong>
                <p>
                  Repeat, revisit, pause or finish. Optional instruction voice
                  and gentle music can both stay off.
                </p>
              </div>
            </li>
            <li>
              <PencilSimpleIcon size={23} />
              <div>
                <strong>Just paper and possibility.</strong>
                <p>
                  No camera, microphone, uploads, cloud AI, accounts or stored
                  child profiles are implemented.
                </p>
              </div>
            </li>
          </ul>
          <p className="review-privacy">
            No app analytics. The hosting provider receives ordinary connection
            metadata. This prototype has not been validated in a child-learning
            study.
          </p>
        </div>
        <figure className="review-phone">
          <img
            src="/review/showcase-mobile.jpg"
            width="375"
            height="849"
            alt="Actual phone-sized local prototype showing the final creative step, a cat demonstration and large labelled lesson controls."
            loading="eager"
          />
          <figcaption>The same local prototype, at phone size.</figcaption>
        </figure>
      </section>
      <footer className="review-footer">
        <span>Trazolino · a personal family project</span>
        <a href="/about/">About</a>
        <a
          href="https://tldraw.dev/get-a-license/hobby"
          target="_blank"
          rel="noopener noreferrer"
        >
          About tldraw's hobby licences <ArrowUpRightIcon size={15} />
        </a>
      </footer>
    </main>
  );
}
