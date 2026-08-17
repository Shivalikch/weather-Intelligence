import Header from "./components/Header";
import MvpNav from "./components/MvpNav";
import Mvp1MapViewer from "./mvp/Mvp1MapViewer";
import Mvp2Alerting from "./mvp/Mvp2Alerting";
import Mvp3Probabilistic from "./mvp/Mvp3Probabilistic";
import Mvp4Severe from "./mvp/Mvp4Severe";
import Mvp5Regional from "./mvp/Mvp5Regional";
import Mvp6Integration from "./mvp/Mvp6Integration";
import Mvp7Model from "./mvp/Mvp7Model";
import Placeholder from "./mvp/Placeholder";
import { useUI } from "./store";

export default function App() {
  const active = useUI((s) => s.activeMvp);

  const render = () => {
    switch (active) {
      case "MVP-1":
        return <Mvp1MapViewer />;
      case "MVP-2":
        return <Mvp2Alerting />;
      case "MVP-3":
        return <Mvp3Probabilistic />;
      case "MVP-4":
        return <Mvp4Severe />;
      case "MVP-5":
        return <Mvp5Regional />;
      case "MVP-6":
        return <Mvp6Integration />;
      case "MVP-7":
        return <Mvp7Model />;
      default:
        return <Placeholder mvp={active} />;
    }
  };

  return (
    <div className="app">
      <Header />
      <div className="body">
        <MvpNav />
        <main className="content" key={active}>
          {render()}
        </main>
      </div>
    </div>
  );
}
