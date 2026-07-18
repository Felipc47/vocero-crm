/**
 * Estado in-memory del mock de Meta Lead Ads (self-test 004). El inbound
 * registra el lead simulado; el graph-mock lo sirve cuando la ingesta hace
 * GET {leadgen_id}?fields=field_data,...
 */

export type MockLead = {
  leadgenId: string;
  formId: string;
  name: string;
  phone: string;
  email: string;
  campaignName: string;
  adName: string;
};

type LeadgenMockState = { leads: Map<string, MockLead>; n: number };

const globalForLeadgen = globalThis as unknown as {
  __leadgenMockState?: LeadgenMockState;
};

export function getLeadgenMockState(): LeadgenMockState {
  if (!globalForLeadgen.__leadgenMockState) {
    globalForLeadgen.__leadgenMockState = { leads: new Map(), n: 0 };
  }
  return globalForLeadgen.__leadgenMockState;
}

export function nextLeadgenN(): number {
  return ++getLeadgenMockState().n;
}

/** Payload real de Meta Lead Ads: object=page, field=leadgen. */
export function buildLeadgenPayload(input: {
  leadgenId: string;
  formId: string;
  pageId?: string;
}) {
  return {
    object: "page",
    entry: [
      {
        id: input.pageId ?? "page_mock_1",
        time: Math.floor(Date.now() / 1000),
        changes: [
          {
            field: "leadgen",
            value: {
              leadgen_id: input.leadgenId,
              form_id: input.formId,
              page_id: input.pageId ?? "page_mock_1",
              created_time: Math.floor(Date.now() / 1000),
            },
          },
        ],
      },
    ],
  };
}
