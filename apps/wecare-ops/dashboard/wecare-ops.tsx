import type { FC } from 'react';
import { useState } from 'react';
import {
  Box,
  Button,
  Card,
  Page,
  Tabs,
  Text,
  WixDesignSystemProvider,
} from '@wix/design-system';
import '@wix/design-system/styles.global.css';
import { WECARE_OPS_REGISTRATION, WECARE_OPS_SECTIONS } from './sections.mjs';

const copy = {
  overview: ['Operational control center', 'Orders, custom order IDs, Catalog V3 SKU tools, Wix business tools, WhatsApp readiness and system diagnostics live here.'],
  orders: ['Orders', 'Review Wix eCommerce order activity and open native Wix order administration when needed.'],
  'order-ids': ['Order IDs', 'The OrderIds collection remains the source of custom WECARE order IDs linked to Wix orders.'],
  'sku-manager': ['SKU Manager', 'Preview missing Catalog V3 SKUs, apply collision-safe SKUs, and change prefixes with explicit confirmation.'],
  invoices: ['Invoices', 'View current Wix invoices inside WECARE and open native Wix Invoices for creation and lifecycle management.'],
  'payment-links': ['Payment Links', 'View Wix payment links inside WECARE and open native Pay Links for creation and payment operations.'],
  forms: ['Forms', 'View Wix Forms inside WECARE and use Wix Forms for schema, submission, and form lifecycle management.'],
  seo: ['SEO', 'Check SEO health and preserve search-engine verification while managing Wix SEO settings.'],
  automations: ['Automations', 'Inspect Wix Automations and keep future internal trigger/action workflows under WECARE.'],
  whatsapp: ['WhatsApp', 'Meta WhatsApp Business Platform integration for order-related notifications, enabled only when secure credentials are present.'],
  'system-tools': ['System Tools', 'Run private administrator diagnostics for Catalog V3, Order IDs, permissions, integrations, and data health.'],
};

const WecareDashboard: FC = () => {
  const [activeId, setActiveId] = useState('overview');
  const [title, description] = copy[activeId as keyof typeof copy] || copy.overview;

  return (
    <WixDesignSystemProvider features={{ newColorsBranding: true }}>
      <Page>
        <Page.Header
          title="WECARE"
          subtitle="Private operations dashboard for WECARE.DIGITAL"
        />
        <Page.Content>
          <Box direction="vertical" gap="SP4">
            <Tabs
              activeId={activeId}
              onClick={(item) => setActiveId(String(item.id))}
              items={WECARE_OPS_SECTIONS.map(section => ({ id: section.id, title: section.label }))}
            />
            <Card>
              <Card.Header title={title} subtitle={description} />
              <Card.Content>
                <Box direction="vertical" gap="SP3">
                  <Text>
                    {WECARE_OPS_REGISTRATION.installed
                      ? 'Private WECARE dashboard registration is active.'
                      : 'WECARE dashboard registration is not active.'}
                  </Text>
                  {activeId === 'sku-manager' && (
                    <Box gap="SP2">
                      <Button disabled={!WECARE_OPS_REGISTRATION.installed}>Preview missing SKUs</Button>
                      <Button disabled={!WECARE_OPS_REGISTRATION.installed}>Apply SKU changes</Button>
                    </Box>
                  )}
                </Box>
              </Card.Content>
            </Card>
          </Box>
        </Page.Content>
      </Page>
    </WixDesignSystemProvider>
  );
};

export default WecareDashboard;
