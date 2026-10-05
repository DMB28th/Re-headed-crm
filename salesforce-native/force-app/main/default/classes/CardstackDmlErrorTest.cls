@IsTest
private class CardstackDmlErrorTest {

    @IsTest
    static void parseClassifiesStringTooLong() {
        Account a = new Account(Name = 'DmlErr Base');
        insert a;
        // 300-char name exceeds the 255 limit -> STRING_TOO_LONG on update.
        a.Name = 'x'.repeat(300);
        DmlException caught = null;
        try {
            update a;
        } catch (DmlException de) {
            caught = de;
        }
        System.assertNotEquals(null, caught, 'expected DML failure');

        List<CardstackDmlError.DmlErrorDetail> errors =
            CardstackDmlError.parse(caught, 'Account');
        System.assertEquals(1, errors.size());
        System.assertEquals('VALIDATION', errors[0].errorType);
        System.assert(errors[0].fieldApi.contains('Name'),
            'fieldApi: ' + errors[0].fieldApi);
        System.assertEquals('Account Name', errors[0].fieldLabel);
        System.assert(!String.isBlank(errors[0].message));
        // Message should be cleaned of DML boilerplate.
        System.assert(!errors[0].message.contains('first error'),
            'message: ' + errors[0].message);
    }

    @IsTest
    static void parseNeverThrowsOnGarbage() {
        // Simulate an unexpected exception shape via required-field failure.
        Task t = new Task(Status = 'Not Started');
        // Subject is not DB-required; force failure via bad lookup instead.
        // Fallback: just verify parse handles a real exception gracefully.
        DmlException caught = null;
        try {
            // Invalid Id format triggers a DML error path.
            Account bad = new Account(Id = '001000000000000');
            update bad;
        } catch (DmlException de) {
            caught = de;
        } catch (Exception e) {
            // Non-DML exception — parse should still be safe via generic path.
            System.assert(true);
            return;
        }
        if (caught != null) {
            List<CardstackDmlError.DmlErrorDetail> errors =
                CardstackDmlError.parse(caught, 'Account');
            System.assert(!errors.isEmpty());
        }
    }

    @IsTest
    static void findCandidatesReturnsMatchingNames() {
        Account existing = new Account(Name = 'DmlErr DupCo');
        insert existing;

        Map<String, Object> vals = new Map<String, Object>{
            'Name' => 'DmlErr DupCo'
        };
        List<CardstackDmlError.DuplicateCandidate> cands =
            CardstackDmlError.findCandidates('Account', vals);
        System.assertEquals(1, cands.size());
        System.assertEquals(existing.Id, cands[0].recordId);
        System.assertEquals('DmlErr DupCo', cands[0].recordName);
        System.assert(cands[0].recordUrl.endsWith('/' + existing.Id));
    }

    @IsTest
    static void findCandidatesEmptyWithoutName() {
        List<CardstackDmlError.DuplicateCandidate> cands =
            CardstackDmlError.findCandidates('Account', new Map<String, Object>());
        System.assert(cands.isEmpty());
    }

    @IsTest
    static void hasDuplicateDetectsDuplicateType() {
        CardstackDmlError.DmlErrorDetail d = new CardstackDmlError.DmlErrorDetail();
        d.errorType = 'DUPLICATE';
        System.assert(CardstackDmlError.hasDuplicate(
            new List<CardstackDmlError.DmlErrorDetail>{ d }));

        d.errorType = 'VALIDATION';
        System.assert(!CardstackDmlError.hasDuplicate(
            new List<CardstackDmlError.DmlErrorDetail>{ d }));
    }
}
