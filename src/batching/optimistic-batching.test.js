import { renderHook } from "@testing-library/react-hooks";
import TestRenderer from "react-test-renderer";
import { usePhotos } from "./optimistic-batching";
const { act } = TestRenderer;

const DEFAULT_PHOTOS = [
  { id: "1", title: "Photo #1", liked: false },
  { id: "2", title: "Photo #2", liked: false },
  { id: "3", title: "Photo #3", liked: false },
  { id: "4", title: "Photo #4", liked: false },
  { id: "5", title: "Photo #5", liked: false },
];

describe("Optimistic batching", () => {
  beforeEach(() => {
    jest.useFakeTimers("modern");
  });

  it("should do an optimistic update immediately", async () => {
    const onUpdate = () => new Promise((resolve) => setTimeout(resolve, 2000));
    const { result, waitForNextUpdate } = renderHook(() =>
      usePhotos({ photos: DEFAULT_PHOTOS, onUpdate })
    );
    function getLikedPhotosNumber() {
      return result.current.photos.filter((photo) => photo.liked).length;
    }
    function getPendingPhotosNumber() {
      return result.current.photos.filter((photo) => photo.pending).length;
    }

    act(() => {
      result.current.handleEdit([
        { id: "1", liked: true },
        { id: "3", liked: true },
      ]);
    });

    expect(getLikedPhotosNumber()).toBe(2);
    expect(getPendingPhotosNumber()).toBe(0);

    await act(async () => {
      jest.advanceTimersByTime(1000);
    });

    expect(getLikedPhotosNumber()).toBe(2);
    expect(getPendingPhotosNumber()).toBe(2);

    await act(async () => {
      jest.runAllTimers();
      await waitForNextUpdate();
    });

    expect(getLikedPhotosNumber()).toBe(2);
    expect(getPendingPhotosNumber()).toBe(0);
  });

  it("should do a batch update", async () => {
    const onUpdate = () => true;
    const { result, waitForNextUpdate } = renderHook(() =>
      usePhotos({ photos: DEFAULT_PHOTOS, onUpdate })
    );

    expect(result.current.photos).toMatchSnapshot();

    act(() => {
      result.current.handleEdit([
        { id: "1", liked: true },
        { id: "3", liked: true },
      ]);
    });

    await act(async () => {
      jest.runAllTimers();
      await waitForNextUpdate();
    });

    expect(result.current.photos).toMatchSnapshot();
  });

  it("should debounce batch update", async () => {
    const onUpdate = () => true;
    const { result, waitForNextUpdate } = renderHook(() =>
      usePhotos({ photos: DEFAULT_PHOTOS, onUpdate })
    );
    function getLikedPhotosNumber() {
      return result.current.photos.filter((photo) => photo.liked).length;
    }
    function getPendingPhotosNumber() {
      return result.current.photos.filter((photo) => photo.pending).length;
    }

    act(() => {
      result.current.handleEdit([
        { id: "1", liked: true },
        { id: "2", liked: true },
      ]);
    });

    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(getLikedPhotosNumber()).toBe(2);
    expect(getPendingPhotosNumber()).toBe(0);

    act(() => {
      result.current.handleEdit([
        { id: "3", liked: true },
        { id: "4", liked: true },
      ]);
    });

    await act(async () => {
      jest.advanceTimersByTime(300);
    });

    expect(getLikedPhotosNumber()).toBe(4);
    expect(getPendingPhotosNumber()).toBe(0);

    await act(async () => {
      jest.runAllTimers();
      await waitForNextUpdate();
    });

    expect(getLikedPhotosNumber()).toBe(4);
    expect(getPendingPhotosNumber()).toBe(0);
  });

  it("should mark items as pending while API call is being processed", async () => {
    const onUpdate = () => new Promise((resolve) => setTimeout(resolve, 2000));
    const { result, waitForNextUpdate } = renderHook(() =>
      usePhotos({ photos: DEFAULT_PHOTOS, onUpdate })
    );
    function getPendingPhotos() {
      return result.current.photos.filter((photo) => photo.pending);
    }

    act(() => {
      result.current.handleEdit([
        { id: "1", liked: true },
        { id: "2", liked: true },
      ]);
    });

    act(() => {
      jest.advanceTimersByTime(600);
    });

    expect(getPendingPhotos()).toMatchSnapshot();

    await act(async () => {
      jest.runAllTimers();
      await waitForNextUpdate();
    });

    expect(result.current.photos).toMatchSnapshot();
  });

  it("should revert items after failed API call", async () => {
    const onUpdate = () => new Promise((_, reject) => setTimeout(reject, 2000));
    const { result, waitForNextUpdate } = renderHook(() =>
      usePhotos({ photos: DEFAULT_PHOTOS, onUpdate })
    );
    function getPendingPhotos() {
      return result.current.photos.filter((photo) => photo.pending);
    }

    act(() => {
      result.current.handleEdit([
        { id: "1", liked: true },
        { id: "2", liked: true },
      ]);
    });

    act(() => {
      jest.advanceTimersByTime(600);
    });

    expect(getPendingPhotos()).toMatchSnapshot();

    await act(async () => {
      jest.runAllTimers();
      await waitForNextUpdate();
    });

    expect(result.current.photos).toMatchSnapshot();
  });
});
