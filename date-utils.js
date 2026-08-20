(function initializeDateUtils(global) {
  function createDateUtils(nowProvider = () => new Date()) {
    function getCurrentDate() {
      return new Date(nowProvider());
    }

    function isComicPublishDate(dateValue) {
      return new Date(dateValue).getDay() !== 0;
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
      const candidateDate = new Date(dateValue);
      if (Number.isNaN(candidateDate.getTime())) return latestCandidate;
      const normalizedDate = moveToComicPublishDate(candidateDate, -1);
      return normalizedDate > latestCandidate ? latestCandidate : normalizedDate;
    }

    return Object.freeze({
      getCurrentDate,
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