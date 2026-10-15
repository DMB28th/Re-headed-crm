const { test } = require("node:test");
const assert = require("node:assert/strict");
const load = () => import("../ui/opportunity-edit/related-contract.mjs");
const parentId = "001000000000001AAA",
  childId = "003000000000001AAA";
const page = () => ({
  contractVersion: "record-related-page/v1",
  parent: {
    recordId: parentId,
    objectApiName: "Account",
    recordName: "Parent",
  },
  listKey: "contacts",
  relationship: "Contacts",
  childObjectApiName: "Contact",
  label: "Contacts",
  definitionFingerprint: "a".repeat(64),
  columns: [{ fieldApi: "Name", label: "Name", dataType: "STRING" }],
  rows: [
    {
      recordId: childId,
      recordName: "Child",
      cells: [{ fieldApi: "Name", value: "Child" }],
    },
  ],
  hasMore: true,
  nextCursor: "private-position",
});
test("projection excludes continuation and untrusted extra fields", async () => {
  const { publicRelatedPage } = await load();
  const result = publicRelatedPage({ ...page(), interactionKey: "secret" });
  assert.equal(result.nextCursor, undefined);
  assert.equal(result.interactionKey, undefined);
  assert.equal(result.rows[0].cells[0].value, "Child");
});
test("closed page request rejects caller query authority", async () => {
  const { relatedPageRequest } = await load();
  assert.throws(
    () =>
      relatedPageRequest({
        parentId,
        listKey: "contacts",
        foreignKey: "OwnerId",
      }),
    /INVALID_REQUEST/,
  );
  assert.deepEqual(relatedPageRequest({ parentId, listKey: "contacts" }), {
    parentId,
    listKey: "contacts",
  });
});
test("closed child request binds exact parent/list/child and validates checksum", async () => {
  const { relatedChildRequest } = await load();
  assert.deepEqual(
    relatedChildRequest({ parentId, listKey: "contacts", childId }),
    { parentId, listKey: "contacts", childId },
  );
  assert.throws(
    () =>
      relatedChildRequest({
        parentId,
        listKey: "contacts",
        childId: childId.slice(0, 15) + "ZZZ",
      }),
    /INVALID_REQUEST/,
  );
});
test("projection rejects mismatched cells and duplicate identities", async () => {
  const { publicRelatedPage } = await load();
  const invalid = page();
  invalid.rows[0].cells[0].fieldApi = "Email";
  assert.throws(() => publicRelatedPage(invalid), /INVALID_RELATED_PAGE/);
  const duplicate = page();
  duplicate.rows.push(duplicate.rows[0]);
  assert.throws(() => publicRelatedPage(duplicate), /INVALID_RELATED_PAGE/);
});
test("decimal literals retain precision and require native currency", async () => {
  const { publicRelatedPage } = await load();
  const raw = page();
  raw.columns = [
    {
      fieldApi: "Amount",
      label: "Amount",
      dataType: "CURRENCY",
      precision: 18,
      scale: 2,
    },
  ];
  raw.rows[0].cells = [
    { fieldApi: "Amount", value: "1234567890123456.78", currencyCode: "EUR" },
  ];
  assert.equal(
    publicRelatedPage(raw).rows[0].cells[0].value,
    "1234567890123456.78",
  );
  delete raw.rows[0].cells[0].currencyCode;
  assert.throws(() => publicRelatedPage(raw), /INVALID_RELATED_PAGE/);
});

test("definitions project only configured summaries and preserve list order", async () => {
  const { publicRelatedDefinitions } = await load();
  const raw = page();
  const result = publicRelatedDefinitions({
    contractVersion: "record-related-definitions/v1",
    parent: raw.parent,
    lists: [
      { ...raw, pageSize: 2, lookupField: "AccountId", nameField: "Name" },
    ],
  });
  assert.equal(result.lists[0].listKey, "contacts");
  assert.equal(result.lists[0].lookupField, undefined);
  assert.equal(result.lists[0].nameField, undefined);
  assert.equal(result.lists[0].pageSize, 2);
});
test("definitions reject duplicate list identity and unbounded page sizes", async () => {
  const { publicRelatedDefinitions } = await load();
  const raw = page(),
    entry = { ...raw, pageSize: 2 };
  assert.throws(
    () =>
      publicRelatedDefinitions({
        contractVersion: "record-related-definitions/v1",
        parent: raw.parent,
        lists: [entry, entry],
      }),
    /INVALID_RELATED_PAGE/,
  );
  assert.throws(
    () =>
      publicRelatedDefinitions({
        contractVersion: "record-related-definitions/v1",
        parent: raw.parent,
        lists: [{ ...entry, pageSize: 51 }],
      }),
    /INVALID_RELATED_PAGE/,
  );
});
test("native percentage decimals retain the literal without grouping coercion", async () => {
  const { publicRelatedPage } = await load();
  const raw = page();
  raw.columns = [
    {
      fieldApi: "Probability",
      label: "Probability",
      dataType: "PERCENT",
      precision: 3,
      scale: 0,
    },
  ];
  raw.rows[0].cells = [{ fieldApi: "Probability", value: "100" }];
  assert.equal(publicRelatedPage(raw).rows[0].cells[0].value, "100");
  raw.rows[0].cells[0].value = "1,00";
  assert.throws(() => publicRelatedPage(raw), /INVALID_RELATED_PAGE/);
});
test("successful empty page cannot advertise phantom continuation", async () => {
  const { publicRelatedPage } = await load();
  const raw = page();
  raw.rows = [];
  raw.hasMore = false;
  assert.deepEqual(publicRelatedPage(raw).rows, []);
  raw.hasMore = true;
  assert.throws(() => publicRelatedPage(raw), /INVALID_RELATED_PAGE/);
});

test("native integer codec precision displays full signed range and rejects overflow", async () => {
  const { publicRelatedPage } = await load();
  const raw = page();
  raw.columns = [
    {
      fieldApi: "NumberOfEmployees",
      label: "Employees",
      dataType: "INTEGER",
      precision: 10,
      scale: 0,
    },
  ];
  raw.rows[0].cells = [{ fieldApi: "NumberOfEmployees", value: "2147483647" }];
  assert.equal(publicRelatedPage(raw).rows[0].cells[0].value, "2147483647");
  raw.rows[0].cells[0].value = "2147483648";
  assert.throws(() => publicRelatedPage(raw), /INVALID_RELATED_PAGE/);
});

test("native calendar DATE is distinct from UTC DATETIME in one related page", async () => {
  const { publicRelatedPage } = await load();
  const raw = page();
  raw.columns = [
    { fieldApi: "CloseDate", label: "Close date", dataType: "DATE" },
    { fieldApi: "CreatedDate", label: "Created", dataType: "DATETIME" },
  ];
  raw.rows[0].cells = [
    { fieldApi: "CloseDate", value: "2028-02-29" },
    { fieldApi: "CreatedDate", value: "2028-02-29T23:12:34Z" },
  ];
  assert.deepEqual(publicRelatedPage(raw).rows[0].cells, raw.rows[0].cells);
  raw.rows[0].cells[0].value = "2028-02-29T00:00:00Z";
  assert.throws(() => publicRelatedPage(raw), /INVALID_RELATED_PAGE/);
  raw.rows[0].cells[0].value = "2028-02-29";
  raw.rows[0].cells[1].value = "2028-02-29";
  assert.throws(() => publicRelatedPage(raw), /INVALID_RELATED_PAGE/);
});
