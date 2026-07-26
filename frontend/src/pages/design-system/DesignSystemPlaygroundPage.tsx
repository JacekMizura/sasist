/**
 * Live Sasist UI Kit documentation — /design-system
 * No business logic; showcase only.
 */

import { useState, type ReactNode } from "react";
import {
  PrimaryButton,
  SecondaryButton,
  DangerButton,
  SuccessButton,
  GhostButton,
  IconButton,
  CardButton,
  Card,
  ListTile,
  MetricCard,
  SegmentedControl,
  SegmentedItem,
  Tabs,
  TabItem,
  Input,
  Select,
  Textarea,
  SearchInput,
  Checkbox,
  Switch,
  Radio,
  StatusText,
  StatusBadge,
  Toolbar,
  PageHeader,
  ProgressBar,
  EmptyState,
  LoadingState,
  Skeleton,
  colors,
  spacing,
  radius,
  typography,
  shadows,
  type UiDensity,
} from "../../design-system";
import { Plus, Search, Settings } from "lucide-react";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="min-w-0 space-y-3">
      <h2 className={typography.h2}>{title}</h2>
      {children}
    </section>
  );
}

function Swatch({ label, className }: { label: string; className: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className={`h-10 w-full ${radius.md} ${className} ring-1 ring-slate-200/80`} />
      <span className={typography.caption}>{label}</span>
    </div>
  );
}

export default function DesignSystemPlaygroundPage() {
  const [density, setDensity] = useState<UiDensity>("default");
  const [segment, setSegment] = useState<"a" | "b">("a");
  const [tab, setTab] = useState<"buttons" | "forms">("buttons");
  const [checked, setChecked] = useState(true);

  return (
    <div className={`min-h-screen ${colors.surface.muted}`}>
      <div className={`mx-auto max-w-5xl space-y-10 ${spacing.p6}`}>
        <PageHeader
          breadcrumbs={<span className={typography.caption}>Sasist / Design System</span>}
          title={<h1 className={typography.h1}>Sasist UI Kit</h1>}
          status={<StatusText tone="success">Źródło prawdy UI</StatusText>}
          actions={
            <PrimaryButton density={density} type="button">
              Primary
            </PrimaryButton>
          }
          toolbar={
            <Toolbar
              start={
                <SegmentedControl density={density}>
                  {(["compact", "default", "comfortable"] as const).map((d) => (
                    <SegmentedItem
                      key={d}
                      density={density}
                      active={density === d}
                      onClick={() => setDensity(d)}
                    >
                      {d}
                    </SegmentedItem>
                  ))}
                </SegmentedControl>
              }
              end={<StatusBadge tone="info">density = {density}</StatusBadge>}
            />
          }
        />

        <Section title="Buttons">
          <div className={`flex flex-wrap items-center ${spacing.gap3}`}>
            <PrimaryButton density={density}>Primary</PrimaryButton>
            <SecondaryButton density={density}>Secondary</SecondaryButton>
            <GhostButton density={density}>Ghost</GhostButton>
            <SuccessButton density={density}>Success</SuccessButton>
            <DangerButton density={density}>Danger</DangerButton>
            <IconButton density={density} aria-label="Dodaj">
              <Plus className="h-4 w-4" />
            </IconButton>
            <IconButton density={density} tone="danger" aria-label="Ustawienia">
              <Settings className="h-4 w-4" />
            </IconButton>
            <CardButton density={density} active>
              CardButton active
            </CardButton>
            <CardButton density={density}>CardButton</CardButton>
          </div>
        </Section>

        <Section title="Cards">
          <div className="grid gap-4 sm:grid-cols-2">
            <Card density={density} variant="section">
              <p className={typography.bodyStrong}>Section card</p>
              <p className={typography.body}>Panele, sekcje, listy.</p>
            </Card>
            <Card density={density} variant="rail">
              <p className={typography.bodyStrong}>Rail card</p>
              <p className={typography.body}>Sidebary / rail.</p>
            </Card>
            <ListTile density={density} selected>
              ListTile selected
            </ListTile>
            <MetricCard density={density} label="Liczba zamówień" value="1 284" unit="szt." hint="KPI" />
          </div>
        </Section>

        <Section title="Inputs">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input density={density} placeholder="Input" />
            <SearchInput density={density} placeholder="Search" />
            <Select density={density} defaultValue="a">
              <option value="a">Select A</option>
              <option value="b">Select B</option>
            </Select>
            <Textarea density={density} placeholder="Textarea" rows={3} />
          </div>
          <div className={`flex flex-wrap items-center ${spacing.gap4} pt-2`}>
            <label className={`flex items-center ${spacing.gap2}`}>
              <Checkbox checked={checked} onChange={(e) => setChecked(e.target.checked)} />
              <span className={typography.body}>Checkbox</span>
            </label>
            <label className={`flex items-center ${spacing.gap2}`}>
              <Radio name="demo" defaultChecked />
              <span className={typography.body}>Radio</span>
            </label>
            <Switch label="Switch" defaultChecked />
          </div>
        </Section>

        <Section title="Segmented / Tabs">
          <SegmentedControl density={density}>
            <SegmentedItem density={density} active={segment === "a"} onClick={() => setSegment("a")}>
              Magazyn
            </SegmentedItem>
            <SegmentedItem density={density} active={segment === "b"} onClick={() => setSegment("b")}>
              Sklep
            </SegmentedItem>
          </SegmentedControl>
          <Tabs>
            <TabItem active={tab === "buttons"} onClick={() => setTab("buttons")}>
              Buttons
            </TabItem>
            <TabItem active={tab === "forms"} onClick={() => setTab("forms")}>
              Forms
            </TabItem>
          </Tabs>
        </Section>

        <Section title="Status">
          <div className={`flex flex-wrap items-center ${spacing.gap3}`}>
            <StatusText density={density} tone="success">
              success
            </StatusText>
            <StatusText density={density} tone="warning">
              warning
            </StatusText>
            <StatusText density={density} tone="danger">
              danger
            </StatusText>
            <StatusBadge density={density} tone="info">
              info
            </StatusBadge>
            <StatusBadge density={density} tone="neutral">
              neutral
            </StatusBadge>
          </div>
          <ProgressBar value={62} className="mt-3 max-w-md" />
        </Section>

        <Section title="Typography">
          <p className={typography.h1}>H1 — Page title</p>
          <p className={typography.h2}>H2 — Section</p>
          <p className={typography.section}>Section label</p>
          <p className={typography.body}>Body text</p>
          <p className={typography.caption}>Caption / meta</p>
        </Section>

        <Section title="Spacing / Radius / Shadows">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Swatch label="radius.sm" className={`${radius.sm} ${colors.surface.page}`} />
            <Swatch label="radius.md" className={`${radius.md} ${colors.surface.page}`} />
            <Swatch label="radius.lg" className={`${radius.lg} ${colors.surface.page}`} />
            <Swatch label="radius.xl" className={`${radius.xl} ${colors.surface.page}`} />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Swatch label="shadows.sm" className={`${colors.surface.page} ${shadows.sm}`} />
            <Swatch label="shadows.md" className={`${colors.surface.page} ${shadows.md}`} />
            <Swatch label="shadows.card" className={`${colors.surface.page} ${shadows.card}`} />
            <Swatch label="gap-4" className={`${colors.primary.softBg}`} />
          </div>
        </Section>

        <Section title="Colors (tokens)">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Swatch label="primary" className={colors.primary.bg} />
            <Swatch label="success" className={colors.success.bg} />
            <Swatch label="warning" className={colors.warning.bg} />
            <Swatch label="danger" className={colors.danger.bg} />
            <Swatch label="info" className={colors.info.bg} />
          </div>
        </Section>

        <Section title="Icons / Toolbar">
          <Toolbar
            start={
              <>
                <SearchInput density={density} placeholder="Szukaj…" className="max-w-xs" />
                <IconButton density={density} aria-label="Szukaj">
                  <Search className="h-4 w-4" />
                </IconButton>
              </>
            }
            end={
              <>
                <SecondaryButton density={density}>Filtruj</SecondaryButton>
                <PrimaryButton density={density}>Dodaj</PrimaryButton>
              </>
            }
          />
        </Section>

        <Section title="Feedback">
          <div className="grid gap-4 sm:grid-cols-3">
            <EmptyState title="Brak danych" description="EmptyState demo" />
            <LoadingState />
            <Skeleton className="h-24 w-full" />
          </div>
        </Section>
      </div>
    </div>
  );
}
