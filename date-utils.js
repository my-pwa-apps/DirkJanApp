(function initializeDateUtils(global) {
  function createDateUtils(nowProvider = () => new Date()) {
    function getCurrentDate() {
      return new Date(nowProvider());
    }

    /**
     * Parses a comic date as a local calendar day.
     * ISO `YYYY-MM-DD` strings are UTC midnight in the Date constructor, which
     * shifts the day backward in negative-offset timezones.
     * @param {string|number|Date} value
     * @returns {Date|null}
     */
    function parseLocalDate(value) {
      if (value instanceof Date) {
        if (Number.isNaN(value.getTime())) return null;
        const localDate = new Date(value.getTime());
        localDate.setHours(0, 0, 0, 0);
        return localDate;
      }

      if (typeof value === 'string') {
        const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (isoMatch) {
          return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
        }

        const compactMatch = value.match(/^(\d{4})(\d{2})(\d{2})$/);
        if (compactMatch) {
          return new Date(Number(compactMatch[1]), Number(compactMatch[2]) - 1, Number(compactMatch[3]));
        }
      }

      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return null;
      parsed.setHours(0, 0, 0, 0);
      return parsed;
    }

    function isComicPublishDate(dateValue) {
      const date = dateValue instanceof Date ? dateValue : parseLocalDate(dateValue);
      return !!(date && date.getDay() !== 0);
    }

    function moveToComicPublishDate(dateValue, direction) {
      const publishDate = new Date(dateValue);
      publishDate.setHours(0, 0, 0, 0);
      while (!isComicPublishDate(publishDate)) {
        publishDate.setDate(publishDate.getDate() + direction);
      }
      return publishDate;
    }

    function getStartupComicDate(baseDate = getCurrentDate()) {
      return moveToComicPublishDate(baseDate, -1);
    }

    function getLatestComicCandidateDate(baseDate = getCurrentDate()) {
      const candidateDate = new Date(baseDate);
      candidateDate.setHours(0, 0, 0, 0);
      const daysUntilFriday = (5 - candidateDate.getDay() + 7) % 7;
      candidateDate.setDate(candidateDate.getDate() + daysUntilFriday);
      return candidateDate;
    }

    function clampToLatestComicCandidate(dateValue) {
      const latestCandidate = getLatestComicCandidateDate();
      const candidateDate = parseLocalDate(dateValue);
      if (!candidateDate) return latestCandidate;
      const normalizedDate = moveToComicPublishDate(candidateDate, -1);
      return normalizedDate > latestCandidate ? latestCandidate : normalizedDate;
    }

    return Object.freeze({
      getCurrentDate,
      parseLocalDate,
      isComicPublishDate,
      moveToComicPublishDate,
      getStartupComicDate,
      getLatestComicCandidateDate,
      clampToLatestComicCandidate
    });
  }

  global.createDateUtils = createDateUtils;
  global.DATE_UTILS = createDateUtils(() => global.__TEST_NOW__ || new Date());
})(globalThis);