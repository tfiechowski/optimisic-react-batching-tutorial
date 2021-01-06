import { renderHook } from "@testing-library/react-hooks";
import TestRenderer from "react-test-renderer";
import { usePhotos, DEBOUNCED_BATCH_TIMEOUT } from "./optimistic-batching";
const { act } = TestRenderer;

const DEFAULT_PHOTOS = [
  { id: "1", title: "Photo #1", liked: false },
  { id: "2", title: "Photo #2", liked: false },
  { id: "3", title: "Photo #3", liked: false },
  { id: "4", title: "Photo #4", liked: false },
  { id: "5", title: "Photo #5", liked: false },
];

const TIME_WITHIN_BATCH_UPDATE_THRESHOLD = DEBOUNCED_BATCH_TIMEOUT - 100;
const TIME_TO_TRIGGER_BATCH_UPDATE = DEBOUNCED_BATCH_TIMEOUT + 100;

function renderComponent({ onUpdate }) {
  const { result, waitForNextUpdate } = renderHook(() =>
    usePhotos({ photos: DEFAULT_PHOTOS, onUpdate })
  );

  function getPhotos() {
    return result.current.photos;
  }

  function getLikedPhotos() {
    return getPhotos().filter((photo) => photo.liked);
  }

  function getDislikedPhotos() {
    return getPhotos().filter((photo) => !photo.liked);
  }

  function getPendingPhotos() {
    return getPhotos().filter((photo) => photo.pending);
  }

  function likePhotos(photoIDs = []) {
    const photosToLike = getPhotos()
      .filter((photo) => photoIDs.includes(photo.id))
      .map((photo) => ({ ...photo, liked: true }));
    return result.current.handleEdit(photosToLike);
  }

  function dislikePhotos(photoIDs = []) {
    const photosToDislike = getPhotos()
      .filter((photo) => photoIDs.includes(photo.id))
      .map((photo) => ({ ...photo, liked: false }));
    return result.current.handleEdit(photosToDislike);
  }

  async function advanceTimersByTime(time) {
    await act(async () => {
      await jest.advanceTimersByTime(time);
    });
  }

  async function advanceTimeToTriggerBatchUpdate() {
    await act(async () => {
      await advanceTimersByTime(TIME_TO_TRIGGER_BATCH_UPDATE);
    });
  }

  return {
    getPhotos,
    getLikedPhotos,
    getDislikedPhotos,
    getPendingPhotos,
    waitForNextUpdate,
    likePhotos: async (photoIDs) => {
      await act(async () => {
        await likePhotos(photoIDs);
      });
    },
    dislikePhotos: async (photoIDs) => {
      await act(async () => {
        await dislikePhotos(photoIDs);
      });
    },
    advanceTimeToTriggerBatchUpdate,
    advanceTimersByTime,
  };
}

describe("Optimistic batching", () => {
  beforeEach(() => {
    jest.useFakeTimers("modern");
  });

  it("should do an optimistic update immediately", async () => {
    const onUpdate = () => new Promise((resolve) => setTimeout(resolve, 2000));
    const {
      getLikedPhotos,
      getPendingPhotos,
      waitForNextUpdate,
      likePhotos,
      advanceTimersByTime,
    } = renderComponent({ onUpdate });

    await likePhotos(["1", "3"]);

    expect(getLikedPhotos().length).toBe(2);
    expect(getPendingPhotos().length).toBe(0);

    await advanceTimersByTime(1000);

    expect(getLikedPhotos().length).toBe(2);
    expect(getPendingPhotos().length).toBe(2);

    await act(async () => {
      jest.runAllTimers();
      await waitForNextUpdate();
    });

    expect(getLikedPhotos().length).toBe(2);
    expect(getPendingPhotos().length).toBe(0);
  });

  it("should do a batch update", async () => {
    const onUpdate = () => true;
    const { waitForNextUpdate, getPhotos, likePhotos } = renderComponent({
      onUpdate,
    });

    expect(getPhotos()).toMatchSnapshot();

    await likePhotos(["1", "3"]);

    await act(async () => {
      jest.runAllTimers();
      await waitForNextUpdate();
    });

    expect(getPhotos()).toMatchSnapshot();
  });

  it("should debounce batch update", async () => {
    const onUpdate = () => true;
    const {
      waitForNextUpdate,
      likePhotos,
      getLikedPhotos,
      getPendingPhotos,
      advanceTimersByTime,
    } = renderComponent({ onUpdate });

    await likePhotos(["1", "2"]);

    await advanceTimersByTime(TIME_WITHIN_BATCH_UPDATE_THRESHOLD);

    expect(getLikedPhotos().length).toBe(2);
    expect(getPendingPhotos().length).toBe(0);

    await likePhotos(["3", "4"]);

    await advanceTimersByTime(TIME_WITHIN_BATCH_UPDATE_THRESHOLD);

    expect(getLikedPhotos().length).toBe(4);
    expect(getPendingPhotos().length).toBe(0);

    await act(async () => {
      jest.runAllTimers();
      await waitForNextUpdate();
    });

    expect(getLikedPhotos().length).toBe(4);
    expect(getPendingPhotos().length).toBe(0);
  });

  it("should mark items as pending while API call is being processed", async () => {
    const onUpdate = () => new Promise((resolve) => setTimeout(resolve, 2000));
    const {
      waitForNextUpdate,
      likePhotos,
      getPhotos,
      getPendingPhotos,
      advanceTimeToTriggerBatchUpdate,
    } = renderComponent({ onUpdate });

    await likePhotos(["1", "2"]);

    await advanceTimeToTriggerBatchUpdate();

    expect(getPendingPhotos()).toMatchSnapshot();

    await act(async () => {
      jest.runAllTimers();
      await waitForNextUpdate();
    });

    expect(getPhotos()).toMatchSnapshot();
  });

  it("should revert items after failed API call", async () => {
    const onUpdate = () => new Promise((_, reject) => setTimeout(reject, 2000));
    const {
      waitForNextUpdate,
      likePhotos,
      getPhotos,
      getPendingPhotos,
      advanceTimeToTriggerBatchUpdate,
    } = renderComponent({ onUpdate });

    await likePhotos(["1", "2"]);

    await advanceTimeToTriggerBatchUpdate();

    expect(getPendingPhotos()).toMatchSnapshot();

    await act(async () => {
      jest.runAllTimers();
      await waitForNextUpdate();
    });

    expect(getPhotos()).toMatchSnapshot();
  });

  it("should do two concurrent batch updates", async () => {
    const mockAPICall = jest.fn();
    const onUpdate = () =>
      new Promise((resolve) => {
        mockAPICall();
        setTimeout(resolve, 2000);
      });
    const {
      waitForNextUpdate,
      likePhotos,
      getLikedPhotos,
      getPendingPhotos,
      advanceTimeToTriggerBatchUpdate,
      advanceTimersByTime,
    } = renderComponent({ onUpdate });

    await likePhotos(["1", "2"]);

    await advanceTimeToTriggerBatchUpdate();

    expect(getLikedPhotos().length).toBe(2);
    expect(getPendingPhotos().length).toBe(2);
    expect(mockAPICall).toBeCalledTimes(1);

    await likePhotos(["3", "4"]);

    await advanceTimeToTriggerBatchUpdate();

    expect(getLikedPhotos().length).toBe(4);
    expect(getPendingPhotos().length).toBe(4);
    expect(mockAPICall).toBeCalledTimes(2);

    await advanceTimersByTime(1500);

    expect(getLikedPhotos().length).toBe(4);
    expect(getPendingPhotos().length).toBe(2);
    expect(mockAPICall).toBeCalledTimes(2);

    await act(async () => {
      jest.runAllTimers();
      await waitForNextUpdate();
    });

    expect(getLikedPhotos().length).toBe(4);
    expect(getPendingPhotos().length).toBe(0);
    expect(mockAPICall).toBeCalledTimes(2);
  });

  it("should not call an API when items came back to original state after modifications", async () => {
    const mockAPICall = jest.fn();
    const onUpdate = () =>
      new Promise((resolve) => {
        mockAPICall();
        setTimeout(resolve, 2000);
      });
    const {
      likePhotos,
      dislikePhotos,
      getLikedPhotos,
      getDislikedPhotos,
      getPendingPhotos,
      advanceTimeToTriggerBatchUpdate,
      advanceTimersByTime,
    } = renderComponent({ onUpdate });

    await likePhotos(["1", "2"]);

    expect(getLikedPhotos().length).toBe(2);
    expect(getPendingPhotos().length).toBe(0);

    await advanceTimersByTime(TIME_WITHIN_BATCH_UPDATE_THRESHOLD);

    await dislikePhotos(["1", "2"]);

    expect(getDislikedPhotos().length).toBe(5);
    expect(getPendingPhotos().length).toBe(0);

    await advanceTimeToTriggerBatchUpdate();

    expect(getDislikedPhotos().length).toBe(5);
    expect(getPendingPhotos().length).toBe(0);
    expect(mockAPICall).not.toHaveBeenCalled();
  });
});
