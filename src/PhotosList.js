import { usePhotos } from "./batching/optimistic-batching";
import { useCallback } from "react";
import styled from "styled-components";

function getRandomBetween(min, max) {
  const diff = max - min;
  return min + Math.floor(Math.random() * diff);
}

const DEFAULT_PHOTOS = new Array(9).fill(0).map((_, index) => ({
  id: String(index + 1),
  src: `${process.env.PUBLIC_URL}/images/${index + 1}.jpeg`,
  liked: false,
}));

const PhotoGrid = styled.div`
  flex: 1;
  max-width: ${750 + 3 * 10}px;
  display: flex;
  align-content: center;
  justify-content: start;
  flex-wrap: wrap;
`;

const PhotoWrapper = styled.div`
  padding: 5px;
  display: flex;
  justify-content: center;
  flex-direction: column;
  align-items: stretch;
  box-sizing: border-box;
  margin-bottom: 10px;
`;

const Photo = styled.div`
  height: 250px;
  width: 250px;
  background-image: ${(props) => `url("${props.src}")`};
  background-size: cover;
  background-position: 50%;
`;

export function PhotosList() {
  const onUpdate = useCallback(() => {
    return new Promise((resolve) =>
      setTimeout(resolve, getRandomBetween(2000, 2500))
    );
  }, []);

  const { photos, handleEdit } = usePhotos({
    photos: DEFAULT_PHOTOS,
    onUpdate,
  });

  function handleLike(photo) {
    handleEdit([Object.assign({}, photo, { liked: true })]);
  }

  function handleDislike(photo) {
    handleEdit([Object.assign({}, photo, { liked: false })]);
  }

  return (
    <PhotoGrid>
      {photos.map((photo) => (
        <PhotoWrapper key={photo.id}>
          <Photo src={photo.src}></Photo>

          {photo.pending ? (
            <button className="btn btn-sm btn-light" disabled>
              Updating ...
            </button>
          ) : photo.liked ? (
            <button
              className="btn btn-sm btn-danger"
              onClick={() => handleDislike(photo)}
            >
              Dislike
            </button>
          ) : (
            <button
              className="btn btn-sm btn-success"
              onClick={() => handleLike(photo)}
            >
              Like
            </button>
          )}
        </PhotoWrapper>
      ))}
    </PhotoGrid>
  );
}
