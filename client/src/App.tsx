import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AppFooter, AppHeader } from "@/components/flix/FlixChrome";
import Home from "@/pages/Home";
import MyList from "@/pages/MyList";
import Search from "@/pages/Search";
import TitleDetails from "@/pages/TitleDetails";
import Watch from "@/pages/Watch";

function Router() {
  return (
    <>
      <AppHeader />
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/search" component={Search} />
        <Route path="/movies" component={Search} />
        <Route path="/tv-shows" component={Search} />
        <Route path="/live-tv" component={Search} />
        <Route path="/my-list" component={MyList} />
        <Route path="/title/:id" component={TitleDetails} />
        <Route path="/watch/:id" component={Watch} />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
      <AppFooter />
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
