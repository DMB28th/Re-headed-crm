# SDD ledger — plan: salesforce-native/docs/superpowers/plans/2026-10-13-studio-admin-experience.md

Approved scope and execution plans: October 13, 2026. User said approved.
Baseline: e761020b200feb5811fce1dc40918cb78f9d15be.
Branch: codex/studio-admin-experience.
Worktree: /Users/danielben-atar/.codex/worktrees/studio-admin-experience/Re-headed-crm.
Execution: T1 → T2 → T3 → E1 → E2 → E3 → L1 → E4 → L2 → R.
Task commits and reviews recorded here; do not re-dispatch completed tasks.

## Preflight task consistency

| Task | Files/tests/interfaces agreement | Ruling |
| --- | --- | --- |
| T1 Home retirement | Retain global Home output types; remove active UI/discovery; retired save/publish rejected; old history remains | Implement as written; no destructive subscriber cleanup |
| T2 semantic diff | Pure module handles modern/legacy and comparison errors; tests cover material policy changes | Implement as written |
| T3 reviewed publishing | Digests and row locks guard exact stored candidate/live; selected sequential batch; public refresh/focusDraft | Implement as written; UI existing compatibility endpoint migrates |
| E1 Overview/access/state | New admin permission; Config runtime readers stay outside Studio gate; count beyond 200 | Implement as written; preserve connection permission separately |
| E2 navigation | Initial openObject exists before dirty guard; Setup stage targeting falls back until E3 | Implement as written |
| E3 staged Setup | Existing STEPS/evidence/contracts retained; stage selection is not evidence | Implement as written |
| L1 policy/catalog | Versioned exposures affect discovery/direct execution; absent/legacy differs from failure | Implement as written, fix any native compile constraint without relaxing policy |
| E4 authoring | Requires field catalog L1; wraps E2 openObject with save/discard/stay; preserves newer editors | Implement as written |
| L2 list editor | Requires L1 policy and E4 leave guard; preserves unknown values; no aliases/default fidelity | Implement as written |
| R verification | Live/upgrade evidence distinct from local tests; no publish/promotion claims before gates | Do concrete source work before requesting any consequential external action |

## Preflight shared files and interfaces

| Pair | Producer/consumer or shared file | Finding/ruling |
| --- | --- | --- |
| T1/T2 | Object builder shapes → comparison | Modern sections/highlights preserved; no conflict |
| T1/T3 | ConfigService retired guard → reviewed publish | Reviewed path must call retirement guard; no bypass |
| T1/E1 | Supported key classifier → accurate count | Count supported default layouts/exposures/flows only |
| T1/E2 | Studio Home removal → six destinations | Legacy checklist removal waits until guide moves |
| T1/E4 | Object audience removal → default authoring | Keep default storage, preserve nondefault historical data |
| T1/L1 | ConfigService candidate validation | Validators coexist with retirement and current record validators |
| T2/T3 | compareConfig → review dialog | Unavailable is explicit, never No changes |
| T2/L2 | compareConfig exposure schema → editor review | Version-1 before/after controls compared |
| T3/E1 | Studio controller/pending count | New admin gate covers reviewed methods |
| T3/E2 | refresh/focusDraft → targeted navigation | Public methods produced in T3 |
| T3/E4 | configchange event → handoff/refresh | Exact keys/operation contract retained |
| T3/L1 | ConfigService/controller | Published validator and digest path coexist |
| E1/E2 | NAV_ITEMS/getStudioOverview → shell/dashboard | Exact six destinations |
| E1/E3 | truthful state → Setup evidence | No manual history promotion |
| E1/E4 | readiness/draftState → authoring | Live and draft coexist; no simulated FLS |
| E1/L1 | Studio access/controller catalog | Admin-only catalog, user-mode runtime metadata |
| E2/E3 | direct Setup mount/openStage | Guide always exists; public stage method added later |
| E2/E4 | openObject/shell → requestLeave | Initial method strengthened without changing signature |
| E2/L2 | ObjectConfig subtree | List child added after authoring guard |
| E3/E4 | setup navigation/shell | Dirty guard covers leaving any editing tab |
| L1/E4 | getStudioFieldCatalog → restriction picker | Boolean updateable adapter doesn't replace existing native validators |
| L1/L2 | version-1 schema/catalog → editor | Stable canonical keys, no invented aliases |
| E4/L2 | requestLeave/configchange → list child | Pending current edits must remain distinct from saved response |
| all/R | acceptance → release QA | Source/model/DOM/Apex/live/package proofs reported separately |

Ruling: Skill workflow and project require scoped Apex/analyzer attempts, but worker subagents must not mutate orgs, JWT, credentials or external client settings. Controller coordinates authorized org verification after source is concrete; unavailable checks remain explicit rather than blocking unrelated source tasks — deployment security actions need separate review if no existing authorization.

## Task state

- T1: complete — 114de0c..e047d99, review clean after fix round 1; 216/216 local; new Apex pending
- T2: complete — 929bdd6..5588bc4, scoped review clean after fix round1
- T3: complete — 9a55035..a0b3d0d, scoped review clean after fix round1
- E1: complete — d8e1c93..0f04d32, reviewed source approved with minors
- E2: complete — dc2a614..2df8fc9, scoped review clean after fix round1
- E3: complete — 5a51a72..61f254e, scoped review clean after fix round1
- L1: complete — 7ca81bc..b92062c, task source review approved
- E4: complete — 9729548..b50a70b, scoped review clean after fix round1
- L2: complete — cd58b84..aa8f172, scoped review clean after fix round1
- R: local source milestone ready — 378/378, final review approved with one disclosed Minor; native/package/host gates owned by Editor Chat

Ruling: T1 may reject newly saved/published nondefault layout candidates with UNSUPPORTED_CONFIGURATION — removes ineffective authoring while retaining stored reads/history; generic setup flags and unrelated compatibility keys remain supported — old callers attempting new audience authoring will receive an honest unsupported result.

Ruling: T1 may update the obsolete two-audience controller test and Studio/ObjectConfig metadata descriptions — fixture becomes retained pre-existing data, not newly authored unsupported layout; supported count becomes one while history remains readable — test change reflects approved retirement, not reduced coverage.

T1 implementation: 9dd5a64ad53096b0002586c9a862b3f55aafecff; 213/213 local; new-source Apex pending; reviewer /root/review_retirement running. Existing-org baseline 21/21 Passed, run 707g800000ob0CUAAY; not verification of new source.

T1 review: Important #1 default All view includes retired pending drafts; Important #2 generic LIMIT200 precedes supported filter. Verified consumer/query. Fix round 1 dispatched to /root/trust_retirement, base 9dd5a64. New service supported-window/count helpers will be consumed by later tasks; history remains separate.

T1 fix interfaces reported: CardstackConfigService.listSupportedDrafts(): List<Cardstack_Config_Draft__c>, newest 200 supported; countSupportedDrafts(): Integer, independent COUNT; c/cardstackStudioKeys.isSupportedStudioKey. getDrafts blank/Draft merges supported window and retained history; PublishCenter separates retained inspection/discard from pending/bulk/diffs. Local fix RED two expected failures; GREEN 7/7; final covering evidence pending.

Task T1: fix round 1/5 (2 addressed, 0 open; commits 9dd5a64..e047d99).
Task T1: complete (commits 114de0c..e047d99, review clean). Scoped reviewer /root/review_retirement approved; Java/Apex/live verification remains R. Minor: baseline analyzer informational whitespace and unavailable Java engines.

T2 implementation: 0732ae5; focused53/53 and complete223/223 local. ESLint2 existing high,166 moderate styles; Java unavailable; native rendering pending R. Reviewer /root/review_semantic_diff dispatched with task package.

T2 review Important: malformed numeric action mapping source returns unchanged; verified validator omission. Fix round1 dispatched. Cross-task runtime/ID/JWT constraints unchanged in this diff; native compile/rendering pending R.
Task T2: minor (deferred): irrelevant React analyzer warning and new-module moderate findings; final review triage.

Task T2: fix round1/5 (1 addressed,0 open; commits0732ae5..5588bc4).
Task T2: complete (commits929bdd6..5588bc4, review clean). Cross-task invariants unchanged; new-source native rendering remains R.

R preflight read-only: cardstack-spike2 limits query API67 returned ActiveScratchOrgs2 remaining of3 and DailyScratchOrgs6 of6. No org created, settings/deployment/client unchanged. Capacity is not install/upgrade evidence.

T3 milestone: RED8/9 failed for missing reviewed flow; firstGREEN18/18 publication+comparison. Worker reports native modal implementation, inspected-unavailable acknowledgement, repeatclick/discard/selection/reconcile; final evidence/review pending.

T3 implementation3ae02e4: focused15/15 complete240/240; scoped Recommended LWC eslint0 violations after CSS fixes, React detection warning; Java engines unavailable. getDraftStatus exactnoncacheable added for authoritative lostresponse reconciliation (task necessity); Admin gate E1. Reviewer /root/review_publication inspecting task locks/selection/reconciliation.

R toolchain preflight: isolated ignored npm compiler9.4.3 installed --ignore-scripts in master/lwc-validation. Controller transformSync({namespace:c,apiVersion:67}) for8 source files in PublishCenter/PublishModel/ReviewDialog/ConfigDiff/StudioKeys completed0 errors/warnings. Syntax-only, no native rendering claim; no product dependency/config changes.

T3 review Important[P2] lost configchange after knownsuccess publish/discard then refreshfailure, confirmed actual handler path/reproduction. Fixround1 dispatched. Minor React warning deferred finaltriage. Cross-task newApex/nativeQA remains R.

R toolchain: ignored local Temurin21.0.12+101.0.LTS archive downloaded official Adoptium API/GitHub, SHA256 checked, java-version exit0. Local path master/java-validation/jdk-21.0.12.1+1/Contents/Home/bin/java; package.evidence.json records provenance (actual filename evidence.json). No shell-profile/globalJAVA_HOME/org change. Initial urllib API403 recovered withcurl. Analyzer-configure referenced skill file absent; no rootscan yet; Java available for later scoped validation using per-commandPATH/JAVA_HOME.

Task T3: fix round1/5 (1 addressed,0 open; commits3ae02e4..a0b3d0d).
Task T3: complete (commits9a55035..a0b3d0d, review clean). Covering34/34 afterfix, full240/240 prefix; newApex/nativeQA remainsR.

E1 milestone: sharedmodel5/5 focused; native Java startsPMD/CPD successfully. Initial scopedRecommended reports69 findings,5high in preexisting Controller queries/catches; newAccess/tests/model0.
Ruling: E1 should preserve unrelated metadata-query semantics and distinguish baseline analyzer findings; only fix concrete introduced gate/Overview gaps — prevents scope drift and unverified access changes — if those baseline findings are real security defects, final R triage must address them before release.

E1 implementation0f04d32: full249/249,focussed6/6,API67compiler/XML passed. PMD nowavailable; scoped72findings,5preexistinghigh,3newmoderate testdispatcher complexity. Fullreport/reviewer dispatched. All23 controllerentries realpermission negative tests authored,newApex unexecuted.

Task E1: minor (deferred): readiness section null/nonarray denylist can throw; E4 integration must guard raw retained data or model; final review triage. Minor React analyzer warning retained.
Task E1: complete (commits d8e1c93..0f04d32, review clean). Runtime ConfigService and connection gate checked unchanged; new-source Apex/native proof remains R.

Ruling: E2 may update obsolete package-stage test requiring the retired checklist to instead require directly mounted ConnectionSetup and omit checklist — necessary approved removal regression, while companion/type expectations preserved — if the retirement staging assumption is wrong, install/upgrade R checks must catch it.
E2 Overview uses getDrafts bounded summaries alongside independent getStudioOverview count; subset labeling required when appropriate.

Ruling: E2 may add minimal successful ObjectConfig save configchange producers with exact keys/operation save after acknowledged saved-state load — shell refresh contract otherwise has no producer — if premature, E4 reconciliation tests must strengthen the boundary before release. Leave/generation work stays E4.
E2 milestoneRED5 expected failures/GREEN5 navigation tests; full suite found anticipated public-api harness stripping maintenance.

E2 implementation1a46b38: full257/257,focused45/45,compiler11files0warnings,XML5passed. Recommended251vs252exactbaseline,0high/no newfindings. Review dispatched; native tab/frame QA remainsR.

E2 review Important: confirmed FlowWizard save+parent reloadfailure loses configchange, focused reproduction verified. Fixround1 dispatched.
Ruling: E2 fix may extend FlowWizard done event with explicit saved/canceled detail — necessary producer for reliable save notification; existing child consumers reviewed — wrong event migration could regress old wizard cancel/save, covered by focused flow/navigation tests.

Task E2: fix round1/5 (1 addressed,0 open; commits1a46b38..2df8fc9).
Task E2: complete (commits dc2a614..2df8fc9, review clean). Full260/260 afterfix; native lazytab/frame/focus remains R.

E3 consumed interface: minimal shell openStage call after targeted Setup render is necessary consumer change once child @api is implemented; no connection backend/settings changes.

Ruling: list task briefs include verbatim phase-level published schema/migration and constraints, which extractor omitted from task blocks — gives workers exact approved contract without whole-plan reads — no scope change; regenerating briefs must preserve this addition.

E3 milestone: RED21oldmodelpass/8newfail; GREEN29/29. Worker reports presentation-only stage selection, blocked recovery before collapsed Advanced; complete/compiler/analyzer/review pending.

E3 implementationb39f39e: full272/272,focused90/90,compiler6files0warnings. Recommended1moderate exactbaseline1moderate,0new/high. Late initial stage request preserved; nativeforms/focus remainsR. Review dispatched.

R verification reminder: CLI deploy help says RunLocalTests excludes installed managed/unlocked package tests. Working org has installed beta; confirm expected new-source classes/methods were actually executed, use explicit affected/source classes or additional RunAllTestsInOrg where needed. Do not equate a successful small RunLocal run with complete native Apex coverage. Disposable source org/package install tests must remain distinct.

E3 review Important: stage switching can change client while observation/export await, attaching Claude outcome/error to ChatGPT; source/reproduction verified. Fixround1 dispatched, preserve requestedstage before initial load. No new minor findings.

Task E3: fix round1/5 (1 addressed,0 open; commitsb39f39e..61f254e).
Task E3: complete (commits5a51a72..61f254e, review clean). Full280/280 afterfix; nativeform/focus/clientQA remainsR.

Ruling: L1 may update obsolete generic staging test exposure version2 to materially distinct valid version1 policies — new explicit-version validator necessarily rejects version2 — preserve rollback/filter coverage and add separate unknownversion denial coverage; otherwise generic test change could hide validator regression.

L2 integration check: existing T2 exposure comparison validates arrays/enabled but not explicit policy version/knownidentity/adHoc shape. L2 parser/diff integration must apply approved version1/legacy boundary so retained malformed or unknown-version supported-key drafts cannot get an unchanged summary. Carry into L2 dispatch and finalreview.

L1 implementationb92062c: local282/282, crosslanguagecontract2/2;26newApex methods unexecuted. FinalPMD313vs235baseline,7sameexistinghigh,0newcritical/high. Legacyrecognized vocabulary bounded by nativeemptydefault plus retiredcore viewId/exposed and id/name rows; unversioned v1enabled/key shape denied. Native compile/runtime pendingR; ordinaryfixture requiresStandardUser. Reviewer dispatched.

Task L1: minor (deferred): disclosed analyzer baseline/moderate findings; final R triage.
Task L1: complete (commits7ca81bc..b92062c, review clean). Runtime delegation/ReadWrite sharing checked; actual Apex/client/nativevisibility pendingR.
Ruling: E4 may add noncacheable admin getStagingInfoFresh(String key) returning the existing staging shape, with controller/access tests — current getStagingInfo is cacheable, so imperative rereads cannot establish lost-save outcome — retain compatibility API and gate first; wrong adapter semantics could break save reconciliation, covered by native tests/R.
Ruling: E4 may add FlowConfig public requestLeave delegation to FlowWizard — shell cannot reach nested editor across shadow roots otherwise — preserve prior completion contract and test actual navigation; wrong delegation could lose unsaved flow edits.

Ruling: E4 may add optional publishedContexts:Array<{key,draftId}> to confirmed publish configchange while preserving keys/operation — approved exact post-publish handoff otherwise lacks IDs — queue exact affected contexts across failed refresh/reconciled outcomes, never infer from historical same-key results; if incompatible, event consumers/tests require correction before release. No runtime/invocable schema change.
E4 milestone: RED49scopedtests40pass/9newfail; working on guards/baselines/fresh reconciliation.

E4 milestone: scoped87/87 after RED; worker reports native activeTabValue kept old during requestLeave, exact publishedContexts queue tests delayedrefresh/unknownrecovery green, fresh admin adapter/tests authored. Complete/compiler/analyzer/review pending; actualApex/nativeQA remainsR.

E4 milestone: complete301/301; compiler25JS/HTML/CSS files0errors/warnings; Recommendedscan running. L2 consumed selector c-cardstack-list-config.requestLeave already hooked inObjectConfig; parentrawlist guards use savedListsJson/isDirty untilchildreplacement.

E4 implementation60af2df: full308/308,compiler25files0errors/warnings; Recommended410vs402baseline same5high,0newCritical/High; lowCSSdelta documented,finaltwoBundle266lowonly. NewfreshApex/access testsunexecuted. E1malformedreadinessminor addressedbyguardtests. Review dispatched.
R preflight readonlyProfile query API67 confirmed Standard User and Minimum Access - Salesforce exist incardstack-spike2; no usercreated/assigned,not executionproof.

E4 review3Important: overlappingmanualreconcile canlockpendingnull/unknowntrue inboth editors; prior-object/newer-input LoadLiveLists overwritescurrent; new actioncellchange notrestoredbyNativeCancel. Firsttwo reproduced; source pathsverified. Fixround1 dispatched. LayoutField.js unchanged existing keyboardmove alreadypresent, templatepreserves native menu; full nativeproof R. Minor inheritedReactwarning deferred.

E4 cannot-verify resolution: unchanged LayoutField.js menuSelect emits native up/down/section fieldedit actions; existing template retains Lightning menu/combobox keyboard controls. No artificial JS edit needed to preserve behavior; actual focus/reorder rendering remains R.

Task E4: fix round1/5 (3 addressed,0 open; commits60af2df..b50a70b).
Task E4: minor (deferred):1Info duplicate localcoalescing wrapper,266LowCSS inherited; finalreviewtriage.
Task E4: complete (commits9729548..b50a70b, review clean). Full321/321,focused114,compiler25; newApex/nativeQA remainsR.
Execution artifacts: currenttask reports/compiler were force-added by someworkers despite ignoredworkspace convention. Controller removes only those currentplan artifacts fromGit index, keepsfiles/evidence locally anddurableledger; existingOct8workspace trackedartifacts untouched. No productsource change.

User steering October 13: Editor Chat owns the shared source baseline and coordinated deployment to one persistent integration org. cardstack-spike2 is a candidate only. This workstream continues local implementation/verification; no independent org creation, auth/host reconstruction, deployment, browser or security changes. Org-dependent Task R gates route through owner; fresh-install orgs only if owner coordinates a specific required package test. Sent exact clean cd58b84 handoff to Editor Chat (01a12b18-ea71-70a3-a73f-21ea0752cdfd).
L2 dispatched fresh /root/declarative_lists at cd58b8442290022b85db5afb03a80b7a948582dd. No external actions; reports remain ignored.
Integration inspection: package/package.xml predates this branch and omits several existing/new Apex/LWC dependencies and custom permission; builder stages entire reviewed families. Owner must construct a complete combined deployment artifact instead of deploying that manifest blindly. This is a deployment-preparation dependency, not a reproduced authentication failure.

Owner coordination: Editor Chat verified integration branch codex/cardstack-integration at editor dd4ff04 in its existing mcp-apps-delivery-proof worktree; persistent org remains read-only verification. Owner will integrate a frozen snapshot and provide getRecordEditCapability(objectApi) descriptor for shared Studio eligibility. L2 consumes existing catalog/fresh staging/save/event interfaces without planned Apex signature changes or runtime renderer edits. Replied under human coordination authorization; final frozen head/inventory to follow review.

Owner confirmed completed cd58b84 prefix merged source-only into integration7110134. No deployment. Frozen descriptor contract record-edit-eligibility/v1 comes from CardstackRecordScreenCapability.describeEligibility(objectApi): canonicalobject,eligible,exclusionReason,orderedfields with nativeRequired/canClear/length/precision/scale. Owner wires admin getRecordEditCapability and adapts existing object-specific Studio predicates/save/readiness/preview to shared renderer. L2 remains unchanged. Final handoff is suffix after cd58b84 plus local whole-branch review findings.

L2 implementation7aae9f4: full347/347,focused69/69,API67 compiler8files0warnings. Recommended216unchangedparentCSSLow,0newbundlefindings; exhaustiveESLint2high byteidenticalparentfunctions,CPDlexicallimits disclosed. Native/Apex/user/client proof deferredowner. Fresh Astra taskreview dispatched with cd58b84..7aae9f4 package.
R local full regression actually rerun at7aae9f4:347passed0failed/skipped. gitdiff--check baseline..HEAD passed. Consolidated changed-source Recommended scan/current baseline comparison underway; no org-dependent operations.

L2reviewImportant: parentleavecheckschildonlybeforeparentawaits; dirtychildintroducedduringparentSaveignoredatfinalreturn. Reviewerfocusedreprofailed; controller verified requestLeave/listsDirty source. Fixround1 dispatchedsameimplementer forsuccessfulleavebranches andpostchildawaitparentguard. MinorCPDdifflexerlimitretained. Cross-taskpublishcannotverifyrootfinalreview/nativeownergates.
ConsolidatedRecommendedat7aae9f4:485findings=7High/145Moderate/324Low/9Info;exacte761changed-pathbaseline369=13High/60Moderate/290Low/6Info. All7currentHigh map existingbaseline PMDgroups (StudioController3CRUD2emptycatch,ListViewSOQL1,ListViewtestdescribe1); finalreviewmusttriagelegitimacy,notdeclarewholebranchclean. BaselineunusedJS/HomeSOQL6highremoved. Resultsparsed/queryviaSkillscripts; snapshotsandfilteredhigh/moderate evidencefinal-analyzer. CLIcommaarraywarningcurrent(baseline uses repeatedflag) andCPDlexicallimits disclosed.

Owner verified cardstack-spike2 persistentDeveloperEdition/nonScratch/noexpiry, installed0.1.0.8/HostedHXL/probe. Existingmanagedcredentials passedREST andAPI67SOAPdescribeMetadata withno auth/login/settingchanges; combinedcheckOnlystillpending. SharedexistinglocalJDK path/invocation/evidence withowner forconsolidatedanalysis. No environmentchangeshere.
Ruling: Keep this plan's ignored validation workspace and toolchain while the integration owner depends on the verified JDK/compiler — preserves working analysis access under the user's coordination instruction — cost if wrong is extra local disk usage; premature cleanup would break the owner's checks.

Ruling: L2 may add the local child @api leaveReady getter (clean, no load/save/recovery/unknown outcome) for the parent’s final synchronous leave guard — asynchronous choices must end with both editors’ current state checked — cost if wrong is an additional LWC contract or blocked navigation needing correction. Apex and shared runtime contracts stay unchanged; the owner was notified.

Task L2: fix round1/5 (1 addressed,0 open; commits7aae9f4..aa8f172).
Task L2: minor(deferred):CPDConfigDifflexicallimit;finaltriage.
Task L2: complete (commitscd58b84..aa8f172, review clean). Re-review approvedbothcurrentstateguards,norepeatwrites;357full/79focused/8API67compiler. Cross-taskpublishintegrationfeedsfinalreview;actualnative/clientenforcementownerpending.
R finalcurrent ataa8f172 rerun357/3570failed/skipped;gitdiff--checkpassed;Recommended485same7High/145Moderate/324Low/9Info. RepeatedtargetflagsremoveCLIarraywarning. All7Highremainexactbaselinegroups;CPDConfigDifflexicallimit+inheritedReactwarningdisclosed. Filteredsummariesfinal-analyzer/current-aa8f172-* plus baseline-high.txt.

Wholebranchreviewa5f5b88 returnedWithFixes:ImportantP2 retainedObject/List/Flowstate notfreshafterpublish/discard/sameobjectreturn,reproducedactualshell0freshreadswithDraftsaved/Nopublishedcard. MinorP3Overviewcoveragebias andprimarypublishreviewinternalnames. ONEfinalfixwave /root/final_admin_fixes dispatchedcomplete3findings,basea5f5b88. Reusefreshread/currentstateguards/sharedlabels,noengine/eligibility/nativeactions. Ownernotifiedholdsuffixfreeze;localpublicrefreshcontractspossible,backendunchanged.
Wholebranchanalyzertriage: existingListViewbuilderdescribe-resolvedfield/object,directionliterals,escapedstrings,typednumerics/boundlimitUSER_MODE; no introducedinjectionfound. Controllermetadataqueriesgatefirst,no newCRMread;emptycatchesgenuineinheritedobservabilitylimitation;testdescribeperformanceonly;syntheticIDs/helperassertwarningsnotmissingassertions. Retainedstyling/coalescingInfo/CPDlimitsdisclosed.
Ruling: Native Apex, Lightning, host and package gates declined by final review remain with the integration owner — the user requires coordinated validation and this local handoff cannot claim deployed acceptance — cost if wrong is delayed release evidence.
Ruling: Shared eligibility generalization belongs to the owner; custom MCP extras, new field types and a new engine remain outside this UX scope — preserve one renderer and Salesforce-owned lifecycle — cost if wrong is follow-up integration work requiring owner validation.
Ruling: Repair of the stale combined deployment manifest remains owner artifact preparation — the builder includes new packageable families, but companion MCP discovery must be included separately — cost if wrong is missing components during combined checkOnly or upgrade, requiring artifact repair.
Ruling: Do not expand this milestone into cleanup of inherited metadata-query empty catches, test describe, CSS/complexity/braces or coalescing wrappers — review found no introduced correctness/security path, and the observability/analyzer limits remain disclosed — cost if wrong is an inherited availability or performance issue requiring a separate fix.
Ruling: Do not claim native concurrency stress coverage for unchanged legacy publish/discard callers — new reviewed-path source guards were checked, while actual caller execution remains an owner gate — cost if wrong is a compatibility race found during native validation; release remains gated on resolution.

Final fix wave: a5f5b88..dae0483 addressed F1 retained editor refresh, F2 configured-first Overview and F3 friendly review names. Scoped re-review: all three addressed, no new Critical/Important; source integration Yes. Fresh root run at dae0483: 378 passed, 0 failed/skipped/cancelled. API67 compiler 11 changed files, 0 warnings. Final scoped Recommended matches exact a5f5b88: 2 inherited findings (1 Moderate frame defer, 1 Info recovery duplication), no introduced Critical/High. No new Apex/runtime contract or external action.
Ruling: Defer the final scoped review's Minor list-refresh automatic retry gap — a caught child read failure retains inputs, shows an error and offers explicit Refresh, while parent retry keys are cleared — cost if wrong is an extra manual retry/temporarily stale admin display; it does not change published runtime authority. Owner native QA must include this recovery path.
Ruling: Finish by preserving this branch/worktree and handing the frozen revision to Editor Chat, without a new integration menu or independent merge/push — the user already assigned integration ownership and requested preservation — cost if wrong is the owner needing a different Git integration method. No cleanup while the owner relies on the shared JDK/compiler or pending native evidence.
Local source delivery is complete for this workstream. Task R native Apex/Lightning/host/install/upgrade evidence remains pending owner; do not mark those gates passed or claim release completion.
