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

    /**
     * Validates a favorite as a real `YYYY-MM-DD` calendar day inside the published range.
     * @param {*} value - Candidate favorite (string or `{ date }` object)
     * @param {string|Date} startDate - First published comic date
     * @param {Date} [latestDate] - Latest possible comic date
     * @returns {string|null} Canonical `YYYY-MM-DD` date or null when invalid
     */
    function normalizeFavoriteDate(value, startDate, latestDate = getLatestComicCandidateDate()) {
      const candidate = value && typeof value === 'object' ? value.date : value;
      if (typeof candidate !== 'string') return null;
      const match = candidate.match(/^(\d{4})([-/])(\d{2})\2(\d{2})$/);
      if (!match) return null;
      const [year, month, day] = [Number(match[1]), Number(match[3]), Number(match[4])];
      const date = new Date(year, month - 1, day);
      if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
      const firstDate = parseLocalDate(startDate);
      if (firstDate && date < firstDate) return null;
      if (latestDate && date > latestDate) return null;
      return `${match[1]}-${match[3]}-${match[4]}`;
    }

    /**
     * Normalizes a favorites list: drops invalid entries, de-duplicates, and sorts.
     * @param {*} values - Candidate favorites array
     * @param {string|Date} startDate - First published comic date
     * @returns {string[]} Sorted canonical favorite dates
     */
    function normalizeFavoriteDates(values, startDate) {
      if (!Array.isArray(values)) return [];
      const latestDate = getLatestComicCandidateDate();
      const normalized = values
        .map(value => normalizeFavoriteDate(value, startDate, latestDate))
        .filter(Boolean);
      return Array.from(new Set(normalized)).sort();
    }

    return Object.freeze({
      getCurrentDate,
      parseLocalDate,
      isComicPublishDate,
      moveToComicPublishDate,
      getStartupComicDate,
      getLatestComicCandidateDate,
      clampToLatestComicCandidate,
      normalizeFavoriteDate,
      normalizeFavoriteDates
    });
  }

  global.createDateUtils = createDateUtils;
  global.DATE_UTILS = createDateUtils(() => global.__TEST_NOW__ || new Date());
})(globalThis);