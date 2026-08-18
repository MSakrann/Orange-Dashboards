import type { DeptProfile } from "@/data/dept-structure";

function OrangeLogo() {
  return (
    <div className="dept-hero-logo" aria-hidden="true">
      <div className="dept-hero-logo-square">
        <span className="dept-hero-logo-word">orange</span>
        <span className="dept-hero-logo-tm">TM</span>
      </div>
    </div>
  );
}

export function DeptHero({ profile }: { profile: DeptProfile }) {
  return (
    <section className="dept-hero" aria-label="Department introduction">
      <div className="dept-hero-atmosphere" aria-hidden="true" />
      <div className="dept-hero-inner">
        <p className="dept-brand">{profile.brandName}</p>
        <h1 className="dept-hero-title">{profile.heroHeadline}</h1>
        <p className="dept-hero-support">{profile.heroSupport}</p>
      </div>
      <OrangeLogo />
    </section>
  );
}
