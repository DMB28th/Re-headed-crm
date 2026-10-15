/** Explicit, sequential selection. Each publication is its own transaction. */
export async function publishSelection(reviews, publishOne) {
    const results = [];
    for (const review of reviews) {
        try {
            await publishOne(review);
            results.push({ draftId: review.draftId, status: 'published' });
        } catch (error) {
            results.push({ draftId: review.draftId, status: 'failed',
                errorCode: error?.errorCode || error?.body?.message || error?.message || 'PUBLISH_FAILED' });
        }
    }
    return results;
}
