import { api } from 'lwc';
import LightningModal from 'lightning/modal';
import { studioConfigLabel } from 'c/cardstackStudioKeys';
import { compareConfig } from 'c/cardstackConfigDiff';

/** Native focus, Escape dismissal and focus restoration belong to LightningModal. */
export default class CardstackReviewDialog extends LightningModal {
    @api reviews = [];
    inspectedIds = [];
    acknowledgedIds = [];

    get rows() {
        return this.reviews.map(review => {
            const comparison = compareConfig(review.key, review.liveValue, review.draftValue);
            return { ...review, label: studioConfigLabel(review.key), comparisonMessage: comparison.message,
                changes: comparison.changes.map((change, index) => ({
                    id: String(index), text: `${change.label}: ${this.value(change.before)} → ${this.value(change.after)}`
                })),
                unavailable: comparison.status === 'unavailable',
                inspected: this.inspectedIds.includes(review.draftId),
                acknowledged: this.acknowledgedIds.includes(review.draftId),
                liveRaw: review.liveValue === null ? 'Nothing published yet (null).' : review.liveValue,
                draftRaw: review.draftValue === null ? '(null)' : review.draftValue
            };
        });
    }
    get confirmDisabled() {
        return !this.rows.length || this.rows.some(row => row.unavailable && (!row.inspected || !row.acknowledged));
    }
    value(value) { return value === undefined ? '(absent)' : JSON.stringify(value); }
    inspect(event) {
        const id = event.currentTarget.dataset.id;
        this.inspectedIds = [...new Set([...this.inspectedIds, id])];
    }
    acknowledge(event) {
        const id = event.currentTarget.dataset.id;
        this.acknowledgedIds = event.target.checked
            ? [...new Set([...this.acknowledgedIds, id])]
            : this.acknowledgedIds.filter(value => value !== id);
    }
    cancel() { this.close(undefined); }
    confirm() { if (!this.confirmDisabled) this.close(true); }
}
