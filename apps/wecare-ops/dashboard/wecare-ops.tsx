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
  overview: ['Operational control center', 'Orders, custom order IDs, SKU tools and future internal utilities live here.'],
  orders: ['Orders', 'Wix eCommerce order administration will be connected here after private dashboard registration.'],
  'order-ids': ['Order IDs', 'The existing OrderIds customer mapping remains the live source of custom WECARE order IDs.'],
  'sku-manager': ['SKU Manager', 'Preview, generate missing SKUs, overwrite by explicit choice, change prefixes and run collision checks.'],
  'system-tools': ['System Tools', 'Health checks and future administrator-only utilities belong here instead of public site Velo.'],
};

const WecareOpsDashboard: FC = () => {
  const [activeId, setActiveId] = useState('overview');
  const [title, description] = copy[activeId as keyof typeof copy] || copy.overview;

  return (
    <WixDesignSystemProvider features={{ newColorsBranding: true }}>
      <Page>
        <Page.Header
          title="WECARE Ops"
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
                      ? 'Private dashboard registration is active.'
                      : 'Source is prepared. Wix dashboard registration is still required before admin API actions can run here.'}
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

export default WecareOpsDashboard;
