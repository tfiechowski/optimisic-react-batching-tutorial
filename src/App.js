import styled from "styled-components";
import "./App.css";
import { PhotosList } from "./batching/PhotosList";

const Container = styled.div`
  display: flex;
  justify-content: center;
  align-content: center;
`;

function App() {
  return (
    <div className="App">
      <Container>
        <PhotosList />
      </Container>
    </div>
  );
}

export default App;
